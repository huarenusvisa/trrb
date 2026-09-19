#!/usr/bin/env python3
"""Parse the official USCIS Asylum Division workbook into a stable JSON snapshot."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from collections import defaultdict
from pathlib import Path

from openpyxl import load_workbook


MONTHS = [
    ("October", 10), ("November", 11), ("December", 12),
    ("January", 1), ("February", 2), ("March", 3),
    ("April", 4), ("May", 5), ("June", 6),
    ("July", 7), ("August", 8), ("September", 9),
]


def number(value):
    if value is None or value == "" or value == "*":
        return None
    if isinstance(value, (int, float)):
        return int(value)
    cleaned = re.sub(r"[^0-9.-]", "", str(value))
    return int(float(cleaned)) if cleaned else None


def period_for(fiscal_year: int, month_number: int) -> str:
    year = fiscal_year - 1 if month_number >= 10 else fiscal_year
    return f"{year:04d}-{month_number:02d}-01"


def table_rows(ws, header_terms):
    values = list(ws.iter_rows(values_only=True))
    header_index = next(
        i for i, row in enumerate(values)
        if row and all(term in [str(cell).strip() for cell in row if cell is not None] for term in header_terms)
    )
    headers = [str(cell).strip() if cell is not None else "" for cell in values[header_index]]
    rows = []
    for raw in values[header_index + 1:]:
        first = str(raw[0] or "").strip()
        if not first or first.lower() in {"footnotes", "additional notes", "references", "source", "definition of key terms"}:
            break
        rows.append(dict(zip(headers, raw)))
    return rows


def suppressed(row) -> bool:
    return any(value == "*" for value in row.values())


def parse_workbook(path: Path, fiscal_year: int, source_url: str, source_title: str):
    workbook = load_workbook(path, data_only=True, read_only=True)
    office = defaultdict(dict)
    nationality = defaultdict(dict)

    simple_sheets = {
        "I-589_Filing": ("applications_received", ["Office", "October"]),
        "I-589_Completion": ("cases_completed", ["Office", "October"]),
        "I-589_Pending": ("cases_pending", ["Office", "October"]),
    }
    for prefix, (field, headers) in simple_sheets.items():
        ws = next((sheet for sheet in workbook.worksheets if sheet.title.startswith(prefix)), None)
        if not ws:
            continue
        for row in table_rows(ws, headers):
            office_name = str(row.get("Office") or "").strip()
            if not office_name or office_name.lower() == "total":
                continue
            for month_name, month_number in MONTHS:
                value = number(row.get(month_name))
                if value in (None, 0) and row.get(month_name) != "*":
                    continue
                key = (office_name, period_for(fiscal_year, month_number))
                office[key][field] = value
                office[key]["has_suppressed_values"] = office[key].get("has_suppressed_values", False) or row.get(month_name) == "*"

    interview_sheet = next((sheet for sheet in workbook.worksheets if sheet.title.startswith("I-589_InterviewOutcome")), None)
    if interview_sheet:
        for row in table_rows(interview_sheet, ["Office", "Interview Outcome", "October"]):
            if str(row.get("Interview Outcome") or "").strip() != "Interview Completed":
                continue
            office_name = str(row.get("Office") or "").strip()
            if not office_name or office_name.lower() == "total":
                continue
            for month_name, month_number in MONTHS:
                value = number(row.get(month_name))
                if value in (None, 0) and row.get(month_name) != "*":
                    continue
                key = (office_name, period_for(fiscal_year, month_number))
                office[key]["interviews_completed"] = value
                office[key]["has_suppressed_values"] = office[key].get("has_suppressed_values", False) or row.get(month_name) == "*"

    outcome_sheet = next((sheet for sheet in workbook.worksheets if sheet.title.startswith("I-589_CaseOutcome")), None)
    outcome_fields = {
        "Grant": "grants",
        "Deny/Referral": "deny_referrals",
        "Admin Close/Dismissal": "admin_close_dismissals",
    }
    if outcome_sheet:
        for row in table_rows(outcome_sheet, ["Office", "Case Outcome", "October"]):
            field = outcome_fields.get(str(row.get("Case Outcome") or "").strip())
            office_name = str(row.get("Office") or "").strip()
            if not field or not office_name or office_name.lower() == "total":
                continue
            for month_name, month_number in MONTHS:
                value = number(row.get(month_name))
                if value in (None, 0) and row.get(month_name) != "*":
                    continue
                key = (office_name, period_for(fiscal_year, month_number))
                office[key][field] = value
                office[key]["has_suppressed_values"] = office[key].get("has_suppressed_values", False) or row.get(month_name) == "*"

    nationality_sheet = next((sheet for sheet in workbook.worksheets if sheet.title.startswith("I-589_Top20Citizenship")), None)
    if nationality_sheet:
        for row in table_rows(nationality_sheet, ["Citizenship", "October"]):
            country = str(row.get("Citizenship") or "").strip().title()
            if not country or country.lower() == "total":
                continue
            for month_name, month_number in MONTHS:
                value = number(row.get(month_name))
                if value in (None, 0) and row.get(month_name) != "*":
                    continue
                key = (country, period_for(fiscal_year, month_number))
                nationality[key] = {
                    "applications_received": value,
                    "has_suppressed_values": row.get(month_name) == "*",
                }

    office_rows = []
    for (office_name, period), metrics in sorted(office.items(), key=lambda item: (item[0][1], item[0][0])):
        grants = metrics.get("grants")
        referrals = metrics.get("deny_referrals")
        merits = (grants or 0) + (referrals or 0)
        office_rows.append({
            "office": office_name,
            "fiscal_year": fiscal_year,
            "period": period,
            **metrics,
            "grant_rate": round((grants or 0) / merits * 100, 3) if merits else None,
        })

    nationality_rows = [
        {"nationality": country, "fiscal_year": fiscal_year, "period": period, **metrics}
        for (country, period), metrics in sorted(nationality.items(), key=lambda item: (item[0][1], item[0][0]))
    ]
    populated_periods = sorted({row["period"] for row in office_rows})
    period_end = None
    if populated_periods:
        last = dt.date.fromisoformat(populated_periods[-1])
        if last.month == 12:
            period_end = f"{last.year}-12-31"
        else:
            period_end = (dt.date(last.year, last.month + 1, 1) - dt.timedelta(days=1)).isoformat()

    return {
        "source": {
            "agency": "U.S. Citizenship and Immigration Services",
            "title": source_title,
            "url": source_url,
            "fiscal_year": fiscal_year,
            "period_end": period_end,
            "official": True,
            "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        },
        "methodology": {
            "grant_rate_formula": "Grant / (Grant + Deny/Referral)",
            "excluded_from_rate": "Admin Close/Dismissal and suppressed values",
            "unit": "applications/cases, not people",
            "warning": "USCIS combines denial and referral in this workbook; this metric is not an officer-specific prediction.",
        },
        "offices": office_rows,
        "nationalities": nationality_rows,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--fiscal-year", type=int, required=True)
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--source-title", default="USCIS Asylum Division Quarterly Statistics")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = parse_workbook(args.workbook, args.fiscal_year, args.source_url, args.source_title)
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")


if __name__ == "__main__":
    main()
