#!/usr/bin/env python3
"""Generate mutually-exclusive EOIR asylum outcomes by FY, court, judge and nationality."""

import csv, io, json, os, re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
import duckdb, requests

PARQUET_PATH = Path(os.environ.get("EOIR_PARQUET_PATH", "/tmp/eoir-cases.parquet"))
STATE_OUTPUT = Path(os.environ.get("EOIR_STATE_PERIOD_OUTPUT", "data/immigration-judge-state-periods.json"))
TREND_OUTPUT = Path(os.environ.get("EOIR_STATE_TREND_OUTPUT", "data/immigration-judge-trends.json"))
TREND_SHARD_COUNT = int(os.environ.get("EOIR_STATE_TREND_SHARDS", "4"))
JUDGE_OUTPUT = Path(os.environ.get("EOIR_JUDGE_NATIONALITY_YEAR_OUTPUT", "data/immigration-judge-nationality-yearly.json"))
SHARD_COUNT = int(os.environ.get("EOIR_JUDGE_NATIONALITY_YEAR_SHARDS", "8"))
SOURCE_DATE = os.environ.get("EOIR_JUDGE_SOURCE_DATE", "2026-07-01")
SCOPE_START = os.environ.get("EOIR_JUDGE_SCOPE_START", "2020-01-01")
SCOPE_END = os.environ.get("EOIR_JUDGE_SCOPE_END", SOURCE_DATE)
COURT_DATA_URL = os.environ.get("ASYLUMTRACKER_COURT_DATA_URL", "https://asylumtracker.com/data/asylum-grant-rates-by-court.csv")
GRANTS = {"FULL GRANT", "GRANT", "CONDITIONAL GRANT", "IN COURT STIPULATED GRANT", "PAPER STIPULATED GRANT"}

def name_key(value):
    text = re.sub(r"\b(?:jr|sr|ii|iii|iv)\.?\b", "", str(value or ""), flags=re.I)
    text = re.sub(r"[^A-Za-z,' -]", " ", text)
    text = re.sub(r"\s+", " ", text).strip().lower()
    if not text: return ""
    if "," in text:
        last, rest = text.split(",", 1)
        return f"{last.strip()}|{rest.strip().split(' ')[0]}"
    parts = text.split()
    return f"{parts[-1]}|{parts[0]}" if len(parts) > 1 else parts[0]

def rate(grants, denials):
    sample = int(grants) + int(denials)
    return round(int(grants) * 100.0 / sample, 6) if sample else None

def court_state_map():
    response = requests.get(COURT_DATA_URL, timeout=60); response.raise_for_status()
    mapping = {}
    for row in csv.DictReader(io.StringIO(response.content.decode("utf-8-sig", errors="replace"))):
        code, state = str(row.get("court_id") or "").strip().upper(), str(row.get("state") or "").strip().upper()
        if code and state: mapping[code] = state
    return mapping

def result_row(values):
    total, grants, denials, other, protection, cancellation, adjustment, voluntary, withdrawn, administrative = map(int, values)
    if total != grants + denials + other or other != protection + cancellation + adjustment + voluntary + withdrawn + administrative:
        raise ValueError(f"outcomes do not reconcile: {values}")
    return {"total_asylum_decisions": total, "grants": grants, "denials": denials, "other_decisions": other,
        "other_protection": protection, "other_cancellation": cancellation, "other_adjustment": adjustment,
        "other_voluntary_departure": voluntary, "other_withdrawn_or_terminated": withdrawn,
        "other_administrative_closure": administrative, "approval_rate": rate(grants, denials)}

def main():
    if not PARQUET_PATH.exists() or PARQUET_PATH.stat().st_size < 50_000_000: raise SystemExit(f"EOIR parquet missing/too small: {PARQUET_PATH}")
    state_by_code = court_state_map()
    grants_sql = ",".join("'" + value.replace("'", "''") + "'" for value in sorted(GRANTS))
    path_sql = str(PARQUET_PATH).replace("'", "''")
    con = duckdb.connect()
    con.execute(f"""
      create temp view outcomes as with source as (
        select trim(judge_last) judge_name, trim(court_last) court_name,
          upper(regexp_extract(trim(court_last), '\\(([^()]{{2,4}})\\)\\s*$', 1)) court_code,
          nullif(trim(nationality),'') nationality, nullif(trim(nationality_code),'') nationality_code,
          cast(ij_completion_date_last as date) decision_date,
          (year(cast(ij_completion_date_last as date)) + case when month(cast(ij_completion_date_last as date)) >= 10 then 1 else 0 end)::integer fiscal_year,
          upper(trim(asylum_decision_last)) asylum_outcome, upper(trim(withholding_decision_last)) withholding_outcome,
          upper(trim(cat_decision_last)) cat_outcome, upper(trim(adjustment_decision_last)) adjustment_outcome,
          upper(trim(non_lpr_cancellation_decision_last)) non_lpr_outcome, upper(trim(lpr_cancellation_decision_last)) lpr_outcome,
          upper(trim(case_outcome)) case_outcome
        from read_parquet('{path_sql}') where judge_last is not null and trim(judge_last) <> '' and court_last is not null and trim(court_last) <> ''
          and ij_completion_date_last is not null and cast(ij_completion_date_last as date) between date '{SCOPE_START}' and date '{SCOPE_END}'
          and upper(trim(asylum_decision_last)) not in ('', 'NO APPLICATION')
      ) select *, case
        when asylum_outcome in ({grants_sql}) then 'grant'
        when withholding_outcome in ({grants_sql}) or cat_outcome in ({grants_sql}, 'GRANT WCAT')
          or case_outcome in ('REMOVE-INA WITHHOLDING GRANTED','REMOVE-CAT WITHHOLDING GRANTED','REMOVE-CAT DEFERRAL GRANTED','GRANT-CAT WITHHOLDING','GRANT-CAT DEFERRAL') then 'other_protection'
        when non_lpr_outcome in ({grants_sql}) or lpr_outcome in ({grants_sql}) then 'other_cancellation'
        when adjustment_outcome in ({grants_sql}) then 'other_adjustment'
        when case_outcome = 'VOLUNTARY DEPARTURE' then 'other_voluntary_departure'
        when case_outcome in ('TERMINATED','DISMISSED BY IJ','WITHDRAW','WITHDRAWN') or asylum_outcome in ('WITHDRAWN','ABANDONMENT') then 'other_withdrawn_or_terminated'
        when case_outcome in ('ADMINISTRATIVE CLOSING - OTHER','ADMINISTRATIVE CLOSURE','PROSECUTORIAL DISCRETION - ADMIN CLOSE','IN COURT PROSECUTORIAL DISCRETION - ADMIN CLOSURE') or asylum_outcome = 'ADMIN CLOSURE' then 'other_administrative_closure'
        when case_outcome = 'RELIEF GRANTED' or asylum_outcome = 'OTHER' then 'other_adjustment'
        when asylum_outcome = 'DENY' then 'deny' else null end outcome from source
    """)
    sums = """count(*)::bigint total, sum((outcome='grant')::integer)::bigint grants, sum((outcome='deny')::integer)::bigint denials,
      sum((outcome like 'other_%')::integer)::bigint other, sum((outcome='other_protection')::integer)::bigint protection,
      sum((outcome='other_cancellation')::integer)::bigint cancellation, sum((outcome='other_adjustment')::integer)::bigint adjustment,
      sum((outcome='other_voluntary_departure')::integer)::bigint voluntary, sum((outcome='other_withdrawn_or_terminated')::integer)::bigint withdrawn,
      sum((outcome='other_administrative_closure')::integer)::bigint administrative"""
    court_rows = con.execute(f"select court_code,court_name,fiscal_year,{sums},count(distinct judge_name)::integer judges from outcomes where outcome is not null group by 1,2,3 order by 3 desc,1").fetchall()
    court_month_rows = con.execute(f"select court_code,court_name,strftime(decision_date,'%Y-%m') period,{sums} from outcomes where outcome is not null group by 1,2,3 order by 3,1").fetchall()
    national_rows = con.execute(f"select fiscal_year,{sums},count(distinct judge_name)::integer judges,count(distinct court_name)::integer courts from outcomes where outcome is not null group by 1 order by 1 desc").fetchall()
    detail_rows = con.execute(f"select judge_name,nationality,max(nationality_code),fiscal_year,{sums},min(decision_date),max(decision_date) from outcomes where outcome is not null and nationality is not null group by 1,2,4 order by 1,4 desc,total desc").fetchall()
    judge_rows = con.execute(f"select judge_name,fiscal_year,{sums},min(decision_date),max(decision_date) from outcomes where outcome is not null group by 1,2 order by 1,2 desc").fetchall()
    court_judge_rows = con.execute(f"select court_code,court_name,judge_name,fiscal_year,{sums},min(decision_date),max(decision_date) from outcomes where outcome is not null group by 1,2,3,4 order by 2,3,4 desc").fetchall()

    states = defaultdict(lambda: defaultdict(lambda: {"courts": set(), "judges": set(), "counts": [0] * 10}))
    unmapped = defaultdict(int)
    for code, court, fiscal_year, *values in court_rows:
        counts = values[:10]; state = state_by_code.get(str(code or "").upper())
        if not state: unmapped[f"{code}:{court}"] += int(counts[0]); continue
        bucket = states[state][int(fiscal_year)]; bucket["courts"].add(str(court))
        for index, value in enumerate(counts): bucket["counts"][index] += int(value)
    for code, fiscal_year, judge_name in con.execute("select court_code,fiscal_year,judge_name from outcomes where outcome is not null group by 1,2,3").fetchall():
        state = state_by_code.get(str(code or "").upper())
        if state: states[state][int(fiscal_year)]["judges"].add(str(judge_name))
    if unmapped: raise SystemExit(f"Unmapped court codes would lose {sum(unmapped.values())} decisions: {dict(unmapped)}")

    state_months = defaultdict(lambda: defaultdict(lambda: [0] * 10))
    court_months = defaultdict(lambda: defaultdict(lambda: [0] * 10))
    for code, court, period, *counts in court_month_rows:
        state = state_by_code.get(str(code or "").upper())
        if not state: continue
        for index, value in enumerate(counts[:10]): state_months[state][str(period)][index] += int(value)
        for index, value in enumerate(counts[:10]): court_months[(state, str(code), str(court))][str(period)][index] += int(value)

    years = sorted({int(row[0]) for row in national_rows}, reverse=True)
    state_payload = []
    for state, year_map in sorted(states.items()):
        state_payload.append({"state": state, "yearly": [{"fiscal_year": year, "courts": len(year_map[year]["courts"]), "judges": len(year_map[year]["judges"]), **result_row(year_map[year]["counts"])} for year in years if year in year_map]})
    state_monthly_payload = [{"state": state, "monthly": [{"period": period, **result_row(counts)} for period, counts in sorted(period_map.items())]}
        for state, period_map in sorted(state_months.items())]
    court_monthly_payload = [{"state": state, "court_code": code, "court_name": court,
        "monthly": [{"period": period, **result_row(counts)} for period, counts in sorted(period_map.items())]}
        for (state, code, court), period_map in sorted(court_months.items())]
    courts = {}
    for code, court, fiscal_year, *values in court_rows:
        counts, judges = values[:10], values[10]; state = state_by_code.get(str(code or "").upper())
        if not state: continue
        item = courts.setdefault((state, str(code), str(court)), {"state": state, "court_code": str(code), "court_name": str(court), "yearly": []})
        item["yearly"].append({"fiscal_year": int(fiscal_year), "judges": int(judges), **result_row(counts)})
    national_payload = []
    for year, *values in national_rows:
        national_payload.append({"fiscal_year": int(year), "judges": int(values[10]), "courts": int(values[11]), **result_row(values[:10])})
    judge_profiles = defaultdict(list)
    for judge, year, *values in judge_rows:
        judge_profiles[name_key(judge)].append({"fiscal_year": int(year), "data_start_date": str(values[10]), "data_end_date": str(values[11]), **result_row(values[:10])})
    court_judge_payload = []
    for code, court, judge, year, *values in court_judge_rows:
        state = state_by_code.get(str(code or "").upper())
        if state:
            court_judge_payload.append({"state": state, "court_code": str(code), "court_name": str(court),
                "judge_name": str(judge), "name_key": name_key(judge), "fiscal_year": int(year),
                "data_start_date": str(values[10]), "data_end_date": str(values[11]), **result_row(values[:10])})

    STATE_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    STATE_OUTPUT.write_text(json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "source_snapshot_date": SOURCE_DATE,
        "scope_start": SCOPE_START, "scope_end": SCOPE_END, "latest_fiscal_year": years[0],
        "latest_period_status": "year_to_date" if SCOPE_END < f"{years[0]}-09-30" else "complete",
        "attribution": "state of the immigration court recorded on each completed case",
        "methodology": "mutually exclusive grant, deny, or other; approval rate = grants / (grants + denials)",
        "other_methodology": "other includes identifiable withholding/CAT protection, cancellation or adjustment relief, voluntary departure, withdrawal/termination/dismissal, and administrative closure; pending records without a qualifying final outcome are excluded",
        "years": years, "national": national_payload, "states": state_payload, "state_monthly": state_monthly_payload, "courts": list(courts.values()), "court_monthly": court_monthly_payload, "court_judges": court_judge_payload,
        "judges": [{"name_key": key, "yearly": rows} for key, rows in sorted(judge_profiles.items()) if key]}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    trend_shard_names = []
    for index in range(TREND_SHARD_COUNT):
        shard_name = f"{TREND_OUTPUT.stem}-{index + 1}{TREND_OUTPUT.suffix}"
        trend_shard_names.append(shard_name)
        TREND_OUTPUT.with_name(shard_name).write_text(json.dumps({
            "states": state_monthly_payload[index::TREND_SHARD_COUNT],
            "courts": court_monthly_payload[index::TREND_SHARD_COUNT]
        }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    TREND_OUTPUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_snapshot_date": SOURCE_DATE,
        "scope_start": SCOPE_START,
        "scope_end": SCOPE_END,
        "shards": trend_shard_names
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    profiles = defaultdict(list)
    for judge, nationality, code, year, *values in detail_rows:
        profiles[name_key(judge)].append({"fiscal_year": int(year), "nationality": nationality, "nationality_code": code,
            "data_start_date": str(values[10]), "data_end_date": str(values[11]), **result_row(values[:10])})
    profile_rows = [{"name_key": key, "rows": rows} for key, rows in sorted(profiles.items()) if key]
    shard_names = []
    for index in range(SHARD_COUNT):
        shard_name = f"{JUDGE_OUTPUT.stem}-{index + 1}{JUDGE_OUTPUT.suffix}"; shard_names.append(shard_name)
        JUDGE_OUTPUT.with_name(shard_name).write_text(json.dumps({"profiles": profile_rows[index::SHARD_COUNT]}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    JUDGE_OUTPUT.write_text(json.dumps({"generated_at": datetime.now(timezone.utc).isoformat(), "source_snapshot_date": SOURCE_DATE,
        "scope_start": SCOPE_START, "scope_end": SCOPE_END, "profile_count": len(profile_rows), "row_count": len(detail_rows), "shards": shard_names}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"years": years, "national": national_payload, "states": len(state_payload), "courts": len(courts), "judge_profiles": len(profile_rows)}, ensure_ascii=False, indent=2))

if __name__ == "__main__": main()
