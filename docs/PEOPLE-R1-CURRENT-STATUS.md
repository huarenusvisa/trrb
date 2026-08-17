# PEOPLE-R1 Current Status

- PEOPLE-R1-N1 — PASS
  - Dedicated independent `public.people` data foundation with permanent UUID and immutable ID guard.
  - Aliases, U.S. regions, occupations, achievements, timeline, sources/evidence tables are bound to person ID.
  - Creator source is stored separately from verification status.
  - Life status is `living | deceased | unknown`, defaults to `unknown`, with no age/death inference logic.
  - Sensitive identity/financial fields are excluded from the product schema.
  - RLS enabled; anonymous/public access is read-only and restricted to published records/accepted sources.
  - Acceptance workflow `PEOPLE-R1 Node 1 Acceptance` completed SUCCESS on main for commit `8e9f78ce517eeb70ff886180aa73b13d561cc2dd`.

- PEOPLE-R1-N2 — RUNNING
- PEOPLE-R1-N3 — WAITING
- PEOPLE-R1-N4 — WAITING
- PEOPLE-R1-N5 — WAITING
- PEOPLE-R1-N6 — WAITING
- PEOPLE-R1-N7 — WAITING
- PEOPLE-R1-N8 — WAITING
- PEOPLE-R1-N9 — WAITING
- PEOPLE-R1-N10 — WAITING

PASS registration is strictly serial. Do not mark N2 PASS until its dedicated acceptance has succeeded on `main`.
