#!/usr/bin/env python3
import csv
import hashlib
import io
import json
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
PARQUET_PATH = Path(os.environ.get("EOIR_PARQUET_PATH", "/tmp/eoir-cases.parquet"))
SOURCE_NAME = os.environ.get("EOIR_JUDGE_SOURCE_NAME", "EOIR FOIA Case Data (official authority; normalized derivative input)")
SOURCE_URL = os.environ.get("EOIR_JUDGE_SOURCE_URL", "https://fileshare.eoir.justice.gov/EOIR%20Case%20Data.zip")
SOURCE_DATE = os.environ.get("EOIR_JUDGE_SOURCE_DATE", "2026-07-01")
PROCESSOR_NAME = os.environ.get("EOIR_JUDGE_PROCESSOR_NAME", "Deportation Data Project")
PROCESSOR_URL = os.environ.get("EOIR_JUDGE_PROCESSOR_URL", "https://deportationdata.org/data/processed/eoir.html")
SCOPE_START = os.environ.get("EOIR_JUDGE_SCOPE_START", "2020-01-01")
SCOPE_END = os.environ.get("EOIR_JUDGE_SCOPE_END", SOURCE_DATE)
AT_MANIFEST_URL = os.environ.get("ASYLUMTRACKER_MANIFEST_URL", "https://asylumtracker.com/data/dataset-manifest.json")
AT_DATA_BASE = "https://asylumtracker.com/data/"
GRANTS = {"FULL GRANT", "GRANT", "CONDITIONAL GRANT", "IN COURT STIPULATED GRANT", "PAPER STIPULATED GRANT"}
MERITS = GRANTS | {"DENY"}


def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def norm_name(value):
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def court_city(value):
    return re.sub(r"\s*\([^)]*\)\s*$", "", str(value or "").strip()) or None


def key(value):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", str(value or "").lower())).strip()


def rate(a, b):
    n = int(a) + int(b)
    return (int(a) * 100.0 / n) if n else None


def sha256_file(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def chunks(rows, n=300):
    for i in range(0, len(rows), n):
        yield rows[i:i+n]


def rest(table, method="GET", params=None, payload=None, prefer=None):
    if not SUPABASE_URL or not SUPABASE_KEY:
        fail("Supabase secrets are missing")
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    response = None
    for attempt in range(5):
        response = requests.request(method, f"{SUPABASE_URL}/rest/v1/{table}", headers=headers, params=params or {}, json=payload, timeout=120)
        if response.status_code not in (429,) and response.status_code < 500:
            break
        time.sleep(2 ** attempt)
    if not response.ok:
        raise RuntimeError(f"{table} {method} {response.status_code}: {response.text[:1500]}")
    if not response.text:
        return None
    try:
        return response.json()
    except Exception:
        return response.text


def benchmark():
    result = {"snapshot": None, "court_state": {}, "files": {}}
    try:
        manifest = requests.get(AT_MANIFEST_URL, timeout=30).json()
        result["snapshot"] = manifest.get("sourceSnapshotDate")
        checksums = manifest.get("checksumsSha256") or {}
        for filename in manifest.get("generatedFiles") or []:
            r = requests.get(AT_DATA_BASE + filename, timeout=60)
            r.raise_for_status()
            digest = hashlib.sha256(r.content).hexdigest()
            if checksums.get(filename) and checksums[filename] != digest:
                raise RuntimeError(f"AsylumTracker checksum mismatch: {filename}")
            rows = list(csv.DictReader(io.StringIO(r.content.decode("utf-8-sig", errors="replace"))))
            result["files"][filename] = {"rows": len(rows), "sha256": digest}
            if "court" in filename.lower():
                for row in rows:
                    city = str(row.get("city") or "").strip()
                    state = str(row.get("state") or "").strip()
                    name = str(row.get("court_name") or "").strip()
                    if city and state:
                        result["court_state"][key(city)] = (city, state)
                    if name and state:
                        result["court_state"][key(name)] = (city or name, state)
    except Exception as exc:
        print(f"WARN: AsylumTracker benchmark unavailable: {exc}")
    return result


def main():
    if not PARQUET_PATH.exists() or PARQUET_PATH.stat().st_size < 50_000_000:
        fail(f"EOIR parquet missing/too small: {PARQUET_PATH}")

    source_hash = sha256_file(PARQUET_PATH)
    crosscheck = benchmark()
    con = duckdb.connect()
    columns = {row[0] for row in con.execute("DESCRIBE SELECT * FROM read_parquet(?)", [str(PARQUET_PATH)]).fetchall()}
    required = {"judge_last", "court_last", "nationality", "nationality_code", "ij_completion_date_last", "asylum_decision_last"}
    missing = required - columns
    if missing:
        fail(f"missing EOIR fields: {sorted(missing)}")

    grants_sql = ",".join("'" + x.replace("'", "''") + "'" for x in sorted(GRANTS))
    merits_sql = ",".join("'" + x.replace("'", "''") + "'" for x in sorted(MERITS))
    path_sql = str(PARQUET_PATH).replace("'", "''")
    con.execute(f"""
      create temp view merits as
      select trim(judge_last) judge_name,
             trim(court_last) court_name,
             nullif(trim(nationality),'') nationality,
             nullif(trim(nationality_code),'') nationality_code,
             cast(ij_completion_date_last as date) decision_date,
             upper(trim(asylum_decision_last)) outcome
      from read_parquet('{path_sql}')
      where judge_last is not null and trim(judge_last)<>''
        and court_last is not null and trim(court_last)<>''
        and ij_completion_date_last is not null
        and cast(ij_completion_date_last as date) between date '{SCOPE_START}' and date '{SCOPE_END}'
        and upper(trim(asylum_decision_last)) in ({merits_sql})
    """)

    merits_count = con.execute("select count(*) from merits").fetchone()[0]
    judge_count = con.execute("select count(distinct judge_name) from merits").fetchone()[0]
    judge_court_pairs = con.execute("select count(*) from (select distinct judge_name,court_name from merits)").fetchone()[0]
    court_count = con.execute("select count(distinct court_name) from merits").fetchone()[0]
    nationality_count = con.execute("select count(distinct nationality) from merits where nationality is not null").fetchone()[0]
    china_count = con.execute("select count(*) from merits where lower(nationality)='china'").fetchone()[0]
    preflight = {"scope": [SCOPE_START, SCOPE_END], "merits_cases": merits_count, "named_judges": judge_count, "judge_court_pairs": judge_court_pairs, "courts": court_count, "nationalities": nationality_count, "china_merits_cases": china_count, "benchmark_snapshot": crosscheck.get("snapshot")}
    print(json.dumps(preflight, indent=2, ensure_ascii=False))

    if merits_count < 100_000:
        fail(f"quality gate: merits_cases={merits_count}")
    if not (900 <= judge_count <= 2200):
        fail(f"quality gate: named_judges={judge_count}")
    if not (50 <= court_count <= 150):
        fail(f"quality gate: courts={court_count}")
    if nationality_count < 50:
        fail(f"quality gate: nationalities={nationality_count}")

    overall = con.execute(f"""
      select judge_name,
             arg_max(court_name, decision_date) current_court,
             count(*)::bigint total,
             sum(case when outcome in ({grants_sql}) then 1 else 0 end)::bigint grants,
             sum(case when outcome='DENY' then 1 else 0 end)::bigint denials,
             min(decision_date) first_date,
             max(decision_date) last_date
      from merits group by judge_name order by judge_name
    """).fetchall()
    yearly = con.execute(f"""
      select judge_name,
             (year(decision_date)+case when month(decision_date)>=10 then 1 else 0 end)::integer fiscal_year,
             count(*)::bigint total,
             sum(case when outcome in ({grants_sql}) then 1 else 0 end)::bigint grants,
             sum(case when outcome='DENY' then 1 else 0 end)::bigint denials
      from merits group by judge_name,fiscal_year order by judge_name,fiscal_year
    """).fetchall()
    nationalities = con.execute(f"""
      select judge_name,nationality,max(nationality_code) nationality_code,
             count(*)::bigint total,
             sum(case when outcome in ({grants_sql}) then 1 else 0 end)::bigint grants,
             sum(case when outcome='DENY' then 1 else 0 end)::bigint denials,
             min(decision_date) first_date,max(decision_date) last_date
      from merits where nationality is not null
      group by judge_name,nationality order by judge_name,nationality
    """).fetchall()

    note = {"scope_start": SCOPE_START, "scope_end": SCOPE_END, "methodology": "Grant rate = grants/(grants+denials); procedural outcomes excluded", "authoritative_source": {"name": SOURCE_NAME, "url": SOURCE_URL, "snapshot_date": SOURCE_DATE}, "normalization_layer": {"name": PROCESSOR_NAME, "url": PROCESSOR_URL, "sha256": source_hash}, "preflight": preflight, "asylumtracker_crosscheck_files": crosscheck.get("files", {})}
    batch = rest("immigration_judge_import_batches", "POST", payload={"source_name": SOURCE_NAME, "source_url": SOURCE_URL, "source_date": SOURCE_DATE, "source_sha256": source_hash, "status": "validated", "input_rows": int(merits_count), "accepted_rows": 0, "rejected_rows": 0, "warning_rows": 0, "notes": json.dumps(note, ensure_ascii=False)}, prefer="return=representation")[0]
    batch_id = batch["id"]
    now = datetime.now(timezone.utc).isoformat()

    state_map = crosscheck.get("court_state", {})
    judges = []
    for name, court, total, grants, denials, first_date, last_date in overall:
        total, grants, denials = int(total), int(grants), int(denials)
        city = court_city(court)
        mapped = state_map.get(key(city)) or state_map.get(key(court)) or (city, None)
        judges.append({"judge_name": name, "judge_name_normalized": norm_name(name), "court_name": court, "court_city": mapped[0] or city, "court_state": mapped[1], "total_asylum_decisions": total, "grants": grants, "denials": denials, "other_decisions": 0, "approval_rate": rate(grants, denials), "denial_rate": rate(denials, grants), "data_start_date": str(first_date), "data_end_date": str(last_date), "source": SOURCE_NAME, "source_updated_at": f"{SOURCE_DATE}T00:00:00Z", "import_batch_id": batch_id, "updated_at": now})

    try:
        judge_ids = {}
        for part in chunks(judges, 200):
            inserted = rest("immigration_judges", "POST", params={"on_conflict": "judge_name_normalized,court_name"}, payload=part, prefer="resolution=merge-duplicates,return=representation") or []
            for row in inserted:
                judge_ids[row["judge_name_normalized"]] = row["id"]
        if len(judge_ids) < int(judge_count * .98):
            raise RuntimeError(f"judge IDs returned {len(judge_ids)}/{judge_count}")

        yearly_payload = []
        for name, fy, total, grants, denials in yearly:
            jid = judge_ids.get(norm_name(name))
            if not jid:
                continue
            total, grants, denials = int(total), int(grants), int(denials)
            yearly_payload.append({"judge_id": jid, "fiscal_year": int(fy), "total_asylum_decisions": total, "grants": grants, "denials": denials, "other_decisions": 0, "approval_rate": rate(grants, denials), "denial_rate": rate(denials, grants), "import_batch_id": batch_id, "updated_at": now})
        for part in chunks(yearly_payload, 400):
            rest("immigration_judge_asylum_yearly", "POST", params={"on_conflict": "judge_id,fiscal_year"}, payload=part, prefer="resolution=merge-duplicates,return=minimal")

        nat_payload = []
        for name, nationality, code, total, grants, denials, first_date, last_date in nationalities:
            jid = judge_ids.get(norm_name(name))
            if not jid:
                continue
            total, grants, denials = int(total), int(grants), int(denials)
            nat_payload.append({"judge_id": jid, "nationality": nationality, "nationality_code": code, "total_asylum_decisions": total, "grants": grants, "denials": denials, "other_decisions": 0, "approval_rate": rate(grants, denials), "data_start_date": str(first_date), "data_end_date": str(last_date), "import_batch_id": batch_id, "updated_at": now})
        for part in chunks(nat_payload, 400):
            rest("immigration_judge_asylum_nationality", "POST", params={"on_conflict": "judge_id,nationality"}, payload=part, prefer="resolution=merge-duplicates,return=minimal")

        rest("immigration_judge_import_batches", "PATCH", params={"id": f"eq.{batch_id}"}, payload={"status": "imported", "accepted_rows": int(merits_count), "completed_at": now}, prefer="return=minimal")
    except Exception as exc:
        rest("immigration_judge_import_batches", "PATCH", params={"id": f"eq.{batch_id}"}, payload={"status": "rejected", "rejected_rows": int(merits_count), "completed_at": datetime.now(timezone.utc).isoformat(), "notes": json.dumps(note, ensure_ascii=False) + f"\nIMPORT ERROR: {exc}"}, prefer="return=minimal")
        raise

    print("EOIR JUDGE IMPORT V2: PASS")
    print(json.dumps({"batch_id": batch_id, "judges": len(judge_ids), "courts": court_count, "merits_decisions": merits_count, "yearly_rows": len(yearly_payload), "nationality_rows": len(nat_payload), "china_merits_cases": china_count}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
