#!/usr/bin/env python3
"""Generate fiscal-year state totals and judge × nationality × fiscal-year data.

The input is the normalized EOIR case parquet used by the judge importer. State
totals are attributed to the court recorded on each completed case, not to the
judge's latest court. This matters when a judge moves courts and prevents New
York City court codes from falling into an "unknown" state bucket.
"""

import csv
import io
import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import requests


PARQUET_PATH = Path(os.environ.get("EOIR_PARQUET_PATH", "/tmp/eoir-cases.parquet"))
STATE_OUTPUT = Path(os.environ.get("EOIR_STATE_PERIOD_OUTPUT", "data/immigration-judge-state-periods.json"))
JUDGE_OUTPUT = Path(os.environ.get("EOIR_JUDGE_NATIONALITY_YEAR_OUTPUT", "data/immigration-judge-nationality-yearly.json"))
SHARD_COUNT = int(os.environ.get("EOIR_JUDGE_NATIONALITY_YEAR_SHARDS", "8"))
SOURCE_DATE = os.environ.get("EOIR_JUDGE_SOURCE_DATE", "2026-07-01")
SCOPE_START = os.environ.get("EOIR_JUDGE_SCOPE_START", "2020-01-01")
SCOPE_END = os.environ.get("EOIR_JUDGE_SCOPE_END", SOURCE_DATE)
COURT_DATA_URL = os.environ.get("ASYLUMTRACKER_COURT_DATA_URL", "https://asylumtracker.com/data/asylum-grant-rates-by-court.csv")
GRANTS = {"FULL GRANT", "GRANT", "CONDITIONAL GRANT", "IN COURT STIPULATED GRANT", "PAPER STIPULATED GRANT"}
MERITS = GRANTS | {"DENY"}


def name_key(value):
    text = re.sub(r"\b(?:jr|sr|ii|iii|iv)\.?\b", "", str(value or ""), flags=re.I)
    text = re.sub(r"[^A-Za-z,' -]", " ", text)
    text = re.sub(r"\s+", " ", text).strip().lower()
    if not text:
        return ""
    if "," in text:
        last, rest = text.split(",", 1)
        first = rest.strip().split(" ")[0]
        return f"{last.strip()}|{first}"
    parts = text.split()
    return f"{parts[-1]}|{parts[0]}" if len(parts) > 1 else parts[0]


def rate(grants, denials):
    total = int(grants) + int(denials)
    return round(int(grants) * 100.0 / total, 6) if total else None


def court_state_map():
    response = requests.get(COURT_DATA_URL, timeout=60)
    response.raise_for_status()
    mapping = {}
    for row in csv.DictReader(io.StringIO(response.content.decode("utf-8-sig", errors="replace"))):
        code = str(row.get("court_id") or "").strip().upper()
        state = str(row.get("state") or "").strip().upper()
        if code and state:
            mapping[code] = state
    return mapping


def result_row(total, grants, denials):
    return {
        "total_asylum_decisions": int(total),
        "grants": int(grants),
        "denials": int(denials),
        "other_decisions": 0,
        "approval_rate": rate(grants, denials),
    }


def main():
    if not PARQUET_PATH.exists() or PARQUET_PATH.stat().st_size < 50_000_000:
        raise SystemExit(f"EOIR parquet missing/too small: {PARQUET_PATH}")

    state_by_code = court_state_map()
    grants_sql = ",".join("'" + value.replace("'", "''") + "'" for value in sorted(GRANTS))
    merits_sql = ",".join("'" + value.replace("'", "''") + "'" for value in sorted(MERITS))
    path_sql = str(PARQUET_PATH).replace("'", "''")
    con = duckdb.connect()
    con.execute(f"""
      create temp view merits as
      select trim(judge_last) judge_name,
             trim(court_last) court_name,
             upper(regexp_extract(trim(court_last), '\\(([^()]{{2,4}})\\)\\s*$', 1)) court_code,
             nullif(trim(nationality),'') nationality,
             nullif(trim(nationality_code),'') nationality_code,
             cast(ij_completion_date_last as date) decision_date,
             (year(cast(ij_completion_date_last as date)) +
               case when month(cast(ij_completion_date_last as date)) >= 10 then 1 else 0 end)::integer fiscal_year,
             upper(trim(asylum_decision_last)) outcome
      from read_parquet('{path_sql}')
      where judge_last is not null and trim(judge_last) <> ''
        and court_last is not null and trim(court_last) <> ''
        and ij_completion_date_last is not null
        and cast(ij_completion_date_last as date) between date '{SCOPE_START}' and date '{SCOPE_END}'
        and upper(trim(asylum_decision_last)) in ({merits_sql})
    """)

    court_rows = con.execute(f"""
      select court_code, court_name, fiscal_year, count(*)::bigint total,
             sum(case when outcome in ({grants_sql}) then 1 else 0 end)::bigint grants,
             sum(case when outcome = 'DENY' then 1 else 0 end)::bigint denials,
             count(distinct judge_name)::integer judges
      from merits group by court_code, court_name, fiscal_year
      order by fiscal_year desc, court_code
    """).fetchall()
    national_rows = con.execute(f"""
      select fiscal_year, count(*)::bigint total,
             sum(case when outcome in ({grants_sql}) then 1 else 0 end)::bigint grants,
             sum(case when outcome = 'DENY' then 1 else 0 end)::bigint denials,
             count(distinct judge_name)::integer judges,
             count(distinct court_name)::integer courts
      from merits group by fiscal_year order by fiscal_year desc
    """).fetchall()
    detail_rows = con.execute(f"""
      select judge_name, nationality, max(nationality_code) nationality_code, fiscal_year,
             count(*)::bigint total,
             sum(case when outcome in ({grants_sql}) then 1 else 0 end)::bigint grants,
             sum(case when outcome = 'DENY' then 1 else 0 end)::bigint denials,
             min(decision_date) first_date, max(decision_date) last_date
      from merits where nationality is not null
      group by judge_name, nationality, fiscal_year
      order by judge_name, fiscal_year desc, total desc
    """).fetchall()

    states = defaultdict(lambda: defaultdict(lambda: {
        "courts": set(), "judges": set(), "total": 0, "grants": 0, "denials": 0
    }))
    unmapped = defaultdict(int)
    for code, court, fiscal_year, total, grants, denials, _ in court_rows:
        state = state_by_code.get(str(code or "").upper())
        if not state:
            unmapped[f"{code}:{court}"] += int(total)
            continue
        bucket = states[state][int(fiscal_year)]
        bucket["courts"].add(str(court))
        bucket["total"] += int(total)
        bucket["grants"] += int(grants)
        bucket["denials"] += int(denials)

    # Exact distinct-judge counts by state and fiscal year.
    judge_state_rows = con.execute("""
      select court_code, fiscal_year, judge_name from merits
      group by court_code, fiscal_year, judge_name
    """).fetchall()
    for code, fiscal_year, judge_name in judge_state_rows:
        state = state_by_code.get(str(code or "").upper())
        if state:
            states[state][int(fiscal_year)]["judges"].add(str(judge_name))

    if unmapped:
        raise SystemExit(f"Unmapped court codes would lose {sum(unmapped.values())} decisions: {dict(unmapped)}")

    years = sorted({int(row[0]) for row in national_rows}, reverse=True)
    state_payload = []
    for state, year_map in sorted(states.items()):
        periods = []
        for year in years:
            bucket = year_map.get(year)
            if not bucket:
                continue
            periods.append({
                "fiscal_year": year,
                "courts": len(bucket["courts"]),
                "judges": len(bucket["judges"]),
                **result_row(bucket["total"], bucket["grants"], bucket["denials"]),
            })
        state_payload.append({"state": state, "yearly": periods})

    court_periods = defaultdict(list)
    for code, court, fiscal_year, total, grants, denials, judges in court_rows:
        state = state_by_code.get(str(code or "").upper())
        if not state:
            continue
        court_periods[(state, str(code), str(court))].append({
            "fiscal_year": int(fiscal_year),
            "judges": int(judges),
            **result_row(total, grants, denials),
        })
    court_payload = [
        {"state": state, "court_code": code, "court_name": court, "yearly": sorted(rows, key=lambda row: row["fiscal_year"], reverse=True)}
        for (state, code, court), rows in sorted(court_periods.items())
    ]

    national_payload = []
    for year, total, grants, denials, judges, courts in national_rows:
        national_payload.append({
            "fiscal_year": int(year), "courts": int(courts), "judges": int(judges),
            **result_row(total, grants, denials),
        })

    STATE_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    STATE_OUTPUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_snapshot_date": SOURCE_DATE,
        "scope_start": SCOPE_START,
        "scope_end": SCOPE_END,
        "latest_fiscal_year": years[0],
        "latest_period_status": "year_to_date" if SCOPE_END < f"{years[0]}-09-30" else "complete",
        "attribution": "state of the immigration court recorded on each completed case",
        "methodology": "grant_count / (grant_count + deny_count); other outcomes excluded",
        "years": years,
        "national": national_payload,
        "states": state_payload,
        "courts": court_payload,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    profiles = defaultdict(list)
    for judge, nationality, code, year, total, grants, denials, first_date, last_date in detail_rows:
        profiles[name_key(judge)].append({
            "fiscal_year": int(year),
            "nationality": nationality,
            "nationality_code": code,
            "data_start_date": str(first_date),
            "data_end_date": str(last_date),
            **result_row(total, grants, denials),
        })
    profile_rows = [{"name_key": key, "rows": rows} for key, rows in sorted(profiles.items()) if key]
    shard_names = []
    for index in range(SHARD_COUNT):
        shard_name = f"{JUDGE_OUTPUT.stem}-{index + 1}{JUDGE_OUTPUT.suffix}"
        shard_names.append(shard_name)
        rows = profile_rows[index::SHARD_COUNT]
        JUDGE_OUTPUT.with_name(shard_name).write_text(
            json.dumps({"profiles": rows}, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
    JUDGE_OUTPUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_snapshot_date": SOURCE_DATE,
        "scope_start": SCOPE_START,
        "scope_end": SCOPE_END,
        "profile_count": len(profile_rows),
        "row_count": len(detail_rows),
        "shards": shard_names,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({
        "state_output": str(STATE_OUTPUT), "years": years,
        "national": national_payload, "states": len(state_payload), "courts": len(court_payload),
        "judge_profiles": len(profile_rows), "judge_nationality_year_rows": len(detail_rows),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
