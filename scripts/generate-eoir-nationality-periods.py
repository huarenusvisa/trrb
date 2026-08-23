#!/usr/bin/env python3
"""Build searchable nationality summaries and true calendar-period trends.

The input is the normalized EOIR case parquet used by the judge statistics
pipeline.  No rates are estimated: every point is aggregated from merits
decisions with a recorded nationality and completion date.
"""

import json
import math
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import duckdb


PARQUET_PATH = Path(os.environ.get("EOIR_PARQUET_PATH", "/tmp/eoir-cases.parquet"))
OUTPUT_PATH = Path(os.environ.get("EOIR_NATIONALITY_OUTPUT", "data/immigration-judge-nationality-periods.json"))
SOURCE_DATE = os.environ.get("EOIR_JUDGE_SOURCE_DATE", "2026-07-01")
SCOPE_START = os.environ.get("EOIR_JUDGE_SCOPE_START", "2020-01-01")
SCOPE_END = os.environ.get("EOIR_JUDGE_SCOPE_END", SOURCE_DATE)
MIN_REPORTABLE = 50
SHARD_COUNT = max(1, int(os.environ.get("EOIR_NATIONALITY_SHARD_COUNT", "8")))
GRANTS = {"FULL GRANT", "GRANT", "CONDITIONAL GRANT", "IN COURT STIPULATED GRANT", "PAPER STIPULATED GRANT"}
MERITS = GRANTS | {"DENY"}


COUNTRY_ZH = {
    "Afghanistan": "阿富汗", "Albania": "阿尔巴尼亚", "Algeria": "阿尔及利亚",
    "Angola": "安哥拉", "Argentina": "阿根廷", "Armenia": "亚美尼亚",
    "Bangladesh": "孟加拉国", "Belarus": "白俄罗斯", "Bolivia": "玻利维亚",
    "Brazil": "巴西", "Cameroon": "喀麦隆", "Canada": "加拿大", "Chile": "智利",
    "China": "中国", "Colombia": "哥伦比亚", "Cuba": "古巴",
    "Dominican Republic": "多米尼加", "Ecuador": "厄瓜多尔", "Egypt": "埃及",
    "El Salvador": "萨尔瓦多", "Eritrea": "厄立特里亚", "Ethiopia": "埃塞俄比亚",
    "Georgia": "格鲁吉亚", "Ghana": "加纳", "Guatemala": "危地马拉",
    "Guinea": "几内亚", "Haiti": "海地", "Honduras": "洪都拉斯",
    "India": "印度", "Indonesia": "印度尼西亚", "Iran": "伊朗", "Iraq": "伊拉克",
    "Jamaica": "牙买加", "Jordan": "约旦", "Kazakhstan": "哈萨克斯坦",
    "Kenya": "肯尼亚", "Mexico": "墨西哥", "Moldova": "摩尔多瓦",
    "Mongolia": "蒙古", "Myanmar": "缅甸", "Nepal": "尼泊尔", "Nicaragua": "尼加拉瓜",
    "Nigeria": "尼日利亚", "North Korea": "朝鲜", "Pakistan": "巴基斯坦",
    "Peru": "秘鲁", "Philippines": "菲律宾", "Romania": "罗马尼亚", "Russia": "俄罗斯",
    "Senegal": "塞内加尔", "Somalia": "索马里", "South Korea": "韩国",
    "Sri Lanka": "斯里兰卡", "Sudan": "苏丹", "Syria": "叙利亚", "Taiwan": "台湾",
    "Turkey": "土耳其", "Ukraine": "乌克兰", "Uzbekistan": "乌兹别克斯坦",
    "Venezuela": "委内瑞拉", "Vietnam": "越南", "Yemen": "也门", "Zimbabwe": "津巴布韦"
}


def rate(grants, denials):
    sample = int(grants) + int(denials)
    return round(int(grants) * 100.0 / sample, 4) if sample else None


def point(label, grants, denials, other=0):
    grants, denials, other = int(grants), int(denials), int(other)
    sample = grants + denials
    calculated = rate(grants, denials)
    return {
        "label": label,
        "total_asylum_decisions": sample + other,
        "grants": grants,
        "denials": denials,
        "other_decisions": other,
        "calculated_approval_rate": calculated,
        "approval_rate": calculated if sample >= MIN_REPORTABLE else None,
        "rate_reliable": sample >= MIN_REPORTABLE,
    }


def main():
    if not PARQUET_PATH.exists() or PARQUET_PATH.stat().st_size < 50_000_000:
        raise SystemExit(f"EOIR parquet missing/too small: {PARQUET_PATH}")

    con = duckdb.connect()
    grants_sql = ",".join("'" + value.replace("'", "''") + "'" for value in sorted(GRANTS))
    path_sql = str(PARQUET_PATH).replace("'", "''")
    rows = con.execute(f"""
      with source as (select trim(nationality) nationality,
             coalesce(nullif(trim(nationality_code),''), lower(trim(nationality))) nationality_code,
             strftime(cast(ij_completion_date_last as date), '%Y-%m') month_label,
             upper(trim(asylum_decision_last)) a, upper(trim(withholding_decision_last)) w,
             upper(trim(cat_decision_last)) cat, upper(trim(adjustment_decision_last)) adj,
             upper(trim(non_lpr_cancellation_decision_last)) nlpr, upper(trim(lpr_cancellation_decision_last)) lpr,
             upper(trim(case_outcome)) co
      from read_parquet('{path_sql}')
      where nationality is not null and trim(nationality)<>''
        and ij_completion_date_last is not null
        and cast(ij_completion_date_last as date) between date '{SCOPE_START}' and date '{SCOPE_END}'
        and upper(trim(asylum_decision_last)) not in ('','NO APPLICATION')
      ), classified as (select *, case
        when a in ({grants_sql}) then 'grant'
        when w in ({grants_sql}) or cat in ({grants_sql},'GRANT WCAT') or co in ('REMOVE-INA WITHHOLDING GRANTED','REMOVE-CAT WITHHOLDING GRANTED','REMOVE-CAT DEFERRAL GRANTED','GRANT-CAT WITHHOLDING','GRANT-CAT DEFERRAL') then 'other'
        when nlpr in ({grants_sql}) or lpr in ({grants_sql}) or adj in ({grants_sql}) then 'other'
        when co in ('VOLUNTARY DEPARTURE','TERMINATED','DISMISSED BY IJ','WITHDRAW','WITHDRAWN','ADMINISTRATIVE CLOSING - OTHER','ADMINISTRATIVE CLOSURE','PROSECUTORIAL DISCRETION - ADMIN CLOSE','IN COURT PROSECUTORIAL DISCRETION - ADMIN CLOSURE','RELIEF GRANTED') or a in ('WITHDRAWN','ABANDONMENT','ADMIN CLOSURE','OTHER') then 'other'
        when a='DENY' then 'deny' else null end outcome from source)
      select nationality,nationality_code,month_label,
             sum((outcome='grant')::integer)::bigint grants,
             sum((outcome='deny')::integer)::bigint denials,
             sum((outcome='other')::integer)::bigint other
      from classified where outcome is not null group by nationality,nationality_code,month_label
      order by nationality,month_label
    """).fetchall()

    countries = {}
    for nationality, code, month_label, grants, denials, other in rows:
        key = str(code or nationality).upper()
        item = countries.setdefault(key, {
            "nationality": nationality,
            "nationality_zh": COUNTRY_ZH.get(nationality),
            "nationality_code": code,
            "monthly": [],
        })
        item["monthly"].append(point(month_label, grants, denials, other))

    for item in countries.values():
        quarterly = defaultdict(lambda: [0, 0, 0])
        yearly = defaultdict(lambda: [0, 0, 0])
        total_grants = total_denials = total_other = 0
        for month in item["monthly"]:
            year, month_number = month["label"].split("-")
            quarter = (int(month_number) - 1) // 3 + 1
            quarterly[f"{year} Q{quarter}"][0] += month["grants"]
            quarterly[f"{year} Q{quarter}"][1] += month["denials"]
            quarterly[f"{year} Q{quarter}"][2] += month["other_decisions"]
            yearly[year][0] += month["grants"]
            yearly[year][1] += month["denials"]
            yearly[year][2] += month["other_decisions"]
            total_grants += month["grants"]
            total_denials += month["denials"]
            total_other += month["other_decisions"]
        item["quarterly"] = [point(label, values[0], values[1], values[2]) for label, values in sorted(quarterly.items())]
        item["yearly"] = [point(label, values[0], values[1], values[2]) for label, values in sorted(yearly.items())]
        item.update(point("all", total_grants, total_denials, total_other))

    sorted_countries = sorted(countries.values(), key=lambda item: item["total_asylum_decisions"], reverse=True)
    shard_size = max(1, math.ceil(len(sorted_countries) / SHARD_COUNT))
    shard_files = []
    for index in range(SHARD_COUNT):
        shard_countries = sorted_countries[index * shard_size:(index + 1) * shard_size]
        if not shard_countries:
            continue
        shard_path = OUTPUT_PATH.with_name(f"{OUTPUT_PATH.stem}-{index + 1}{OUTPUT_PATH.suffix}")
        shard_path.write_text(
            json.dumps({"countries": shard_countries}, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        shard_files.append(shard_path.name)

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_snapshot_date": SOURCE_DATE,
        "scope_start": SCOPE_START,
        "scope_end": SCOPE_END,
        "minimum_reportable_decisions": MIN_REPORTABLE,
        "methodology": "three mutually exclusive outcomes; approval rate = grant_count / (grant_count + deny_count); other outcomes displayed but excluded from rate",
        "country_count": len(sorted_countries),
        "shards": shard_files,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(OUTPUT_PATH),
        "countries": len(sorted_countries),
        "monthly_points": sum(len(item["monthly"]) for item in sorted_countries),
        "shards": shard_files,
        "scope": [SCOPE_START, SCOPE_END],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
