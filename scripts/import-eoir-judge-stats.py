#!/usr/bin/env python3
import csv
import hashlib
import io
import json
import math
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
PARQUET_PATH = os.environ.get("EOIR_PARQUET_PATH", "/tmp/eoir-cases.parquet")
SOURCE_NAME = os.environ.get(
    "EOIR_JUDGE_SOURCE_NAME",
    "EOIR FOIA case data processed by Deportation Data Project",
)
SOURCE_URL = os.environ.get(
    "EOIR_JUDGE_SOURCE_URL",
    "https://deportationdata.org/data/processed/eoir.html",
)
SOURCE_DATE = os.environ.get("EOIR_JUDGE_SOURCE_DATE", "2026-07-01")
AT_MANIFEST_URL = os.environ.get(
    "ASYLUMTRACKER_MANIFEST_URL",
    "https://asylumtracker.com/data/dataset-manifest.json",
)
AT_DATA_BASE = "https://asylumtracker.com/data/"

GRANT_OUTCOMES = {
    "FULL GRANT",
    "GRANT",
    "CONDITIONAL GRANT",
    "IN COURT STIPULATED GRANT",
    "PAPER STIPULATED GRANT",
}
MERITS_OUTCOMES = GRANT_OUTCOMES | {"DENY"}


def die(msg):
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(1)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def normalize_name(value):
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def normalize_court_key(value):
    s = re.sub(r"\s*\([^)]*\)\s*$", "", str(value or "").strip())
    s = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return re.sub(r"\s+", " ", s)


def court_city_from_name(value):
    s = re.sub(r"\s*\([^)]*\)\s*$", "", str(value or "").strip())
    return s or None


def fetch_asylumtracker_benchmark():
    """Fetch only AsylumTracker's explicitly reusable aggregate snapshot for cross-checks."""
    try:
        r = requests.get(AT_MANIFEST_URL, timeout=30)
        r.raise_for_status()
        manifest = r.json()
        files = manifest.get("generatedFiles") or []
        checksums = manifest.get("checksumsSha256") or {}
        result = {
            "snapshot": manifest.get("sourceSnapshotDate"),
            "seed_version": manifest.get("seedVersion"),
            "files": {},
            "court_state_map": {},
        }
        for filename in files:
            fr = requests.get(AT_DATA_BASE + filename, timeout=60)
            fr.raise_for_status()
            digest = hashlib.sha256(fr.content).hexdigest()
            expected = checksums.get(filename)
            if expected and digest != expected:
                raise RuntimeError(f"checksum mismatch for {filename}: {digest} != {expected}")
            text = fr.content.decode("utf-8-sig", errors="replace")
            reader = csv.DictReader(io.StringIO(text))
            rows = list(reader)
            result["files"][filename] = {
                "rows": len(rows),
                "sha256": digest,
                "columns": reader.fieldnames or [],
            }
            if "court" in filename.lower():
                fields = {str(x).lower(): x for x in (reader.fieldnames or [])}
                loc_key = None
                for candidate in ("location", "court", "court_name", "name"):
                    if candidate in fields:
                        loc_key = fields[candidate]
                        break
                if loc_key:
                    for row in rows:
                        loc = str(row.get(loc_key) or "").strip()
                        m = re.match(r"^(.*?),\s*([A-Z]{2})$", loc)
                        if not m:
                            continue
                        city, state = m.group(1).strip(), m.group(2)
                        result["court_state_map"][normalize_court_key(city)] = {
                            "city": city,
                            "state": state,
                        }
        return result
    except Exception as exc:
        print(f"WARN: AsylumTracker benchmark unavailable: {exc}")
        return {"snapshot": None, "files": {}, "court_state_map": {}}


def supabase_request(table, method="GET", params=None, payload=None, prefer=None):
    if not SUPABASE_URL or not SUPABASE_KEY:
        die("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing")
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    for attempt in range(5):
        r = requests.request(
            method,
            url,
            headers=headers,
            params=params or {},
            json=payload,
            timeout=120,
        )
        if r.status_code < 500 and r.status_code != 429:
            break
        time.sleep(2 ** attempt)
    if not r.ok:
        raise RuntimeError(f"{table} {method} {r.status_code}: {r.text[:1000]}")
    if not r.text:
        return None
    try:
        return r.json()
    except Exception:
        return r.text


def chunks(rows, size=300):
    for i in range(0, len(rows), size):
        yield rows[i:i + size]


def percent(grants, denials):
    n = grants + denials
    return (grants * 100.0 / n) if n else None


def main():
    parquet = Path(PARQUET_PATH)
    if not parquet.exists() or parquet.stat().st_size < 50_000_000:
        die(f"EOIR parquet missing or too small: {parquet}")

    print(f"EOIR source file: {parquet} ({parquet.stat().st_size:,} bytes)")
    source_sha = sha256_file(parquet)
    benchmark = fetch_asylumtracker_benchmark()
    print("AsylumTracker benchmark:", json.dumps({
        "snapshot": benchmark.get("snapshot"),
        "files": benchmark.get("files", {}),
    }, ensure_ascii=False))

    con = duckdb.connect()
    cols = {r[0] for r in con.execute(
        "DESCRIBE SELECT * FROM read_parquet(?)", [str(parquet)]
    ).fetchall()}
    required = {
        "judge_last", "court_last", "nationality", "nationality_code",
        "ij_completion_date_last", "asylum_decision_last",
    }
    missing = sorted(required - cols)
    if missing:
        die(f"processed EOIR parquet missing columns {missing}; available sample={sorted(cols)[:80]}")

    grants_sql = ",".join("'" + x.replace("'", "''") + "'" for x in sorted(GRANT_OUTCOMES))
    merits_sql = ",".join("'" + x.replace("'", "''") + "'" for x in sorted(MERITS_OUTCOMES))

    con.execute(f"""
        CREATE TEMP VIEW merits AS
        SELECT
            trim(judge_last) AS judge_name,
            trim(court_last) AS court_name,
            nullif(trim(nationality), '') AS nationality,
            nullif(trim(nationality_code), '') AS nationality_code,
            CAST(ij_completion_date_last AS DATE) AS decision_date,
            upper(trim(asylum_decision_last)) AS outcome
        FROM read_parquet('{str(parquet).replace("'", "''")}')
        WHERE judge_last IS NOT NULL AND trim(judge_last) <> ''
          AND court_last IS NOT NULL AND trim(court_last) <> ''
          AND ij_completion_date_last IS NOT NULL
          AND upper(trim(asylum_decision_last)) IN ({merits_sql})
    """)

    merits_count = con.execute("SELECT count(*) FROM merits").fetchone()[0]
    judge_count = con.execute("SELECT count(*) FROM (SELECT DISTINCT judge_name, court_name FROM merits)").fetchone()[0]
    court_count = con.execute("SELECT count(DISTINCT court_name) FROM merits").fetchone()[0]
    nationality_count = con.execute("SELECT count(DISTINCT nationality) FROM merits WHERE nationality IS NOT NULL").fetchone()[0]
    china_count = con.execute("SELECT count(*) FROM merits WHERE lower(nationality)='china'").fetchone()[0]
    print(json.dumps({
        "merits_cases": merits_count,
        "judge_profiles": judge_count,
        "courts": court_count,
        "nationalities": nationality_count,
        "china_merits_cases": china_count,
    }, indent=2))

    if merits_count < 100_000:
        die(f"quality gate: only {merits_count:,} merits asylum outcomes")
    if not (800 <= judge_count <= 2500):
        die(f"quality gate: judge count {judge_count} outside expected range")
    if not (50 <= court_count <= 150):
        die(f"quality gate: court count {court_count} outside expected range")
    if nationality_count < 50:
        die(f"quality gate: nationality count {nationality_count} too small")

    judge_rows_raw = con.execute(f"""
        SELECT judge_name, court_name,
               count(*)::BIGINT AS total_decisions,
               sum(CASE WHEN outcome IN ({grants_sql}) THEN 1 ELSE 0 END)::BIGINT AS grants,
               sum(CASE WHEN outcome='DENY' THEN 1 ELSE 0 END)::BIGINT AS denials,
               min(decision_date) AS data_start_date,
               max(decision_date) AS data_end_date
        FROM merits
        GROUP BY judge_name, court_name
        ORDER BY judge_name, court_name
    """).fetchall()

    yearly_raw = con.execute(f"""
        SELECT judge_name, court_name,
               (year(decision_date) + CASE WHEN month(decision_date) >= 10 THEN 1 ELSE 0 END)::INTEGER AS fiscal_year,
               count(*)::BIGINT AS total_decisions,
               sum(CASE WHEN outcome IN ({grants_sql}) THEN 1 ELSE 0 END)::BIGINT AS grants,
               sum(CASE WHEN outcome='DENY' THEN 1 ELSE 0 END)::BIGINT AS denials
        FROM merits
        GROUP BY judge_name, court_name, fiscal_year
        ORDER BY judge_name, court_name, fiscal_year
    """).fetchall()

    nat_raw = con.execute(f"""
        SELECT judge_name, court_name, nationality, max(nationality_code) AS nationality_code,
               count(*)::BIGINT AS total_decisions,
               sum(CASE WHEN outcome IN ({grants_sql}) THEN 1 ELSE 0 END)::BIGINT AS grants,
               sum(CASE WHEN outcome='DENY' THEN 1 ELSE 0 END)::BIGINT AS denials,
               min(decision_date) AS data_start_date,
               max(decision_date) AS data_end_date
        FROM merits
        WHERE nationality IS NOT NULL
        GROUP BY judge_name, court_name, nationality
        ORDER BY judge_name, court_name, nationality
    """).fetchall()

    batch_payload = {
        "source_name": SOURCE_NAME,
        "source_url": SOURCE_URL,
        "source_date": SOURCE_DATE,
        "source_sha256": source_sha,
        "status": "validated",
        "input_rows": int(merits_count),
        "accepted_rows": 0,
        "rejected_rows": 0,
        "warning_rows": 0,
        "notes": json.dumps({
            "methodology": "grant rate = grants/(grants+denials); procedural outcomes excluded",
            "processed_dataset": "Deportation Data Project CC0, derived from monthly EOIR FOIA Case Data",
            "judge_profiles": judge_count,
            "courts": court_count,
            "nationalities": nationality_count,
            "yearly_groups": len(yearly_raw),
            "nationality_groups": len(nat_raw),
            "asylumtracker_snapshot": benchmark.get("snapshot"),
            "asylumtracker_files": benchmark.get("files", {}),
        }, ensure_ascii=False),
    }
    created = supabase_request(
        "immigration_judge_import_batches",
        method="POST",
        payload=batch_payload,
        prefer="return=representation",
    )
    batch_id = created[0]["id"]
    now = datetime.now(timezone.utc).isoformat()

    court_map = benchmark.get("court_state_map", {})
    judge_payloads = []
    for judge_name, court_name, total, grants, denials, start, end in judge_rows_raw:
        total, grants, denials = int(total), int(grants), int(denials)
        city = court_city_from_name(court_name)
        mapped = court_map.get(normalize_court_key(city)) or {}
        judge_payloads.append({
            "judge_name": judge_name,
            "judge_name_normalized": normalize_name(judge_name),
            "court_name": court_name,
            "court_city": mapped.get("city") or city,
            "court_state": mapped.get("state"),
            "total_asylum_decisions": total,
            "grants": grants,
            "denials": denials,
            "other_decisions": 0,
            "approval_rate": percent(grants, denials),
            "denial_rate": percent(denials, grants),
            "data_start_date": str(start) if start else None,
            "data_end_date": str(end) if end else None,
            "source": SOURCE_NAME,
            "source_updated_at": f"{SOURCE_DATE}T00:00:00Z",
            "import_batch_id": batch_id,
            "updated_at": now,
        })

    judge_id_map = {}
    try:
        for chunk in chunks(judge_payloads, 200):
            rows = supabase_request(
                "immigration_judges",
                method="POST",
                params={"on_conflict": "judge_name_normalized,court_name"},
                payload=chunk,
                prefer="resolution=merge-duplicates,return=representation",
            )
            for row in rows or []:
                judge_id_map[(row["judge_name_normalized"], row["court_name"])] = row["id"]

        if len(judge_id_map) < int(judge_count * 0.98):
            raise RuntimeError(f"judge upsert returned only {len(judge_id_map)}/{judge_count} IDs")

        yearly_payloads = []
        for judge_name, court_name, fy, total, grants, denials in yearly_raw:
            key = (normalize_name(judge_name), court_name)
            judge_id = judge_id_map.get(key)
            if not judge_id:
                continue
            total, grants, denials = int(total), int(grants), int(denials)
            yearly_payloads.append({
                "judge_id": judge_id,
                "fiscal_year": int(fy),
                "total_asylum_decisions": total,
                "grants": grants,
                "denials": denials,
                "other_decisions": 0,
                "approval_rate": percent(grants, denials),
                "denial_rate": percent(denials, grants),
                "import_batch_id": batch_id,
                "updated_at": now,
            })
        for chunk in chunks(yearly_payloads, 400):
            supabase_request(
                "immigration_judge_asylum_yearly",
                method="POST",
                params={"on_conflict": "judge_id,fiscal_year"},
                payload=chunk,
                prefer="resolution=merge-duplicates,return=minimal",
            )

        nat_payloads = []
        for judge_name, court_name, nationality, nationality_code, total, grants, denials, start, end in nat_raw:
            key = (normalize_name(judge_name), court_name)
            judge_id = judge_id_map.get(key)
            if not judge_id:
                continue
            total, grants, denials = int(total), int(grants), int(denials)
            nat_payloads.append({
                "judge_id": judge_id,
                "nationality": nationality,
                "nationality_code": nationality_code,
                "total_asylum_decisions": total,
                "grants": grants,
                "denials": denials,
                "other_decisions": 0,
                "approval_rate": percent(grants, denials),
                "data_start_date": str(start) if start else None,
                "data_end_date": str(end) if end else None,
                "import_batch_id": batch_id,
                "updated_at": now,
            })
        for chunk in chunks(nat_payloads, 400):
            supabase_request(
                "immigration_judge_asylum_nationality",
                method="POST",
                params={"on_conflict": "judge_id,nationality"},
                payload=chunk,
                prefer="resolution=merge-duplicates,return=minimal",
            )

        supabase_request(
            "immigration_judge_import_batches",
            method="PATCH",
            params={"id": f"eq.{batch_id}"},
            payload={
                "status": "imported",
                "accepted_rows": int(merits_count),
                "completed_at": now,
            },
            prefer="return=minimal",
        )
    except Exception as exc:
        try:
            supabase_request(
                "immigration_judge_import_batches",
                method="PATCH",
                params={"id": f"eq.{batch_id}"},
                payload={
                    "status": "rejected",
                    "rejected_rows": int(merits_count),
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "notes": batch_payload["notes"] + f"\nIMPORT ERROR: {exc}",
                },
                prefer="return=minimal",
            )
        finally:
            raise

    stats = supabase_request(
        "immigration_judges",
        params={"select": "id,court_name,total_asylum_decisions,grants,denials", "limit": 5000},
    ) or []
    db_judges = len(stats)
    db_courts = len({x.get("court_name") for x in stats if x.get("court_name")})
    db_decisions = sum(int(x.get("grants") or 0) + int(x.get("denials") or 0) for x in stats)
    if db_judges < 800 or db_courts < 50 or db_decisions < 100_000:
        die(f"post-import verification failed judges={db_judges} courts={db_courts} decisions={db_decisions}")

    print("EOIR JUDGE IMPORT: PASS")
    print(json.dumps({
        "batch_id": batch_id,
        "source_date": SOURCE_DATE,
        "judges": db_judges,
        "courts": db_courts,
        "decided_asylum_outcomes": db_decisions,
        "yearly_rows": len(yearly_payloads),
        "nationality_rows": len(nat_payloads),
        "china_merits_cases": china_count,
        "asylumtracker_snapshot": benchmark.get("snapshot"),
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
