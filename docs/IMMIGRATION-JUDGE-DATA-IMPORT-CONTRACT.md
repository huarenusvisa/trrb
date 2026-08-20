# Immigration Judge Asylum Data — Import Contract

## Goal
Only import asylum adjudication data that can be traced to a verifiable source and whose granularity matches the product claim.

## Required judge-level fields
- `judge_name`
- `court_name`
- `total_asylum_decisions`
- `grants`
- `denials`
- `other_decisions`
- `source`
- `source_updated_at`

## Optional dimensions
- `fiscal_year` — only when the source explicitly identifies the fiscal year.
- `nationality` / `nationality_code` — only when the source explicitly provides judge × nationality data.
- `data_start_date` / `data_end_date` — statistical coverage window.

## Hard rules
1. Never infer judge-level nationality rates from national, state, or court aggregates.
2. Never fill missing counts with invented values.
3. Do not treat `other_decisions` as denials.
4. Product adjudicated approval rate is `grants / (grants + denials)` when denominator > 0.
5. Keep total-case grant share separately as `grants / total_asylum_decisions`.
6. Duplicate identity key: normalized judge + court + fiscal year + nationality dimension.
7. Reject rows where any count is negative or where grants + denials + other exceeds a supplied total.
8. Preserve source name and source update timestamp for auditability.

## Pre-import gate
Run:

`node scripts/immigration-judge-data-validator.mjs data.json`

Any `error` blocks import. Warnings require review but do not automatically block import.

## UI confidence rules
- adjudicated sample < 50: small sample warning
- 50–199: medium sample warning
- >= 200: standard display, still not a prediction of an individual case

## Current product hierarchy
United States → State → Court → Judge → Fiscal year → Nationality.
