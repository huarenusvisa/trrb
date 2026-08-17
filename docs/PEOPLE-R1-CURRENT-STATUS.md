# PEOPLE-R1 Current Status

- PEOPLE-R1-N1 — PASS
  - Dedicated independent `public.people` data foundation with permanent UUID and immutable ID guard.
  - Aliases, U.S. regions, occupations, achievements, timeline, sources/evidence tables are bound to person ID.
  - Creator source is stored separately from verification status.
  - Life status is `living | deceased | unknown`, defaults to `unknown`, with no age/death inference logic.
  - Sensitive identity/financial fields are excluded from the product schema.
  - RLS enabled; anonymous/public access is read-only and restricted to published records/accepted sources.
  - Acceptance workflow `PEOPLE-R1 Node 1 Acceptance` completed SUCCESS on main for commit `8e9f78ce517eeb70ff886180aa73b13d561cc2dd`.

- PEOPLE-R1-N2 — PASS
  - “美国华人人物志” is registered inside the existing `专题聚焦` area and routes to `/people/` without taking the homepage recruitment slot.
  - `/people/` is an independent, indexable product landing page with its own product marker and permanent-ID/source/verification/privacy principles.
  - Empty inventory is rendered as a truthful empty state; no example people, fabricated biographies, or AI-generated facts are used as filler.
  - Dedicated acceptance workflow `PEOPLE-R1 Node 2 Acceptance` completed SUCCESS on main for commit `4dd4cbd206bab394adf7e14e96135fa0d9584d47`.

- PEOPLE-R1-N3 — RUNNING
- PEOPLE-R1-N4 — WAITING
- PEOPLE-R1-N5 — WAITING
- PEOPLE-R1-N6 — WAITING
- PEOPLE-R1-N7 — WAITING
- PEOPLE-R1-N8 — WAITING
- PEOPLE-R1-N9 — WAITING
- PEOPLE-R1-N10 — WAITING

PASS registration is strictly serial. Do not mark N3 PASS until its dedicated acceptance has succeeded on `main`.
