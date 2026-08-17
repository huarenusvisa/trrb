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

- PEOPLE-R1-N3 — PASS
  - Published-person search supports name and alias matching plus state, city, occupation, and life-status filters.
  - Duplicate names are intentionally allowed; permanent `person_id` remains the identity key.
  - Search results expose only coarse public disambiguators: birth/death year, U.S. arrival year, U.S. regions, occupation, and verification status.
  - Public search excludes sensitive identity/financial identifiers and uses bounded pagination.
  - Dedicated acceptance workflow `PEOPLE-R1 Node 3 Acceptance` completed SUCCESS on main for commit `38e9b436ea6b6836c0241eb6e6ab90e331145a04`.

- PEOPLE-R1-N4 — PASS
  - Authenticated users can submit a person as self, family/friend, netizen, or editorial creator; editorial creation is role-gated.
  - Creation source and relationship label are recorded separately from verification status.
  - New records enter review as `unverified`; creation never grants verification or public publication.
  - Submitters can inspect only their own submission metadata under RLS.
  - Dedicated acceptance workflow `PEOPLE-R1 Node 4 Acceptance` completed SUCCESS on main for commit `89ef4bf3e3675ca8a69b3dbe176eb9bc56de949f`.

- PEOPLE-R1-N5 — PASS
  - Public biography detail pages render approved biography, U.S. migration/work history, important years, governed photos, stories, and timeline content without inventing missing facts.
  - Public detail APIs expose only published/approved material and keep source/evidence relationships auditable.
  - Photo/story visibility is governed; sensitive identity/financial data is not exposed through the public detail surface.
  - Dedicated acceptance workflow `PEOPLE-R1 Node 5 Acceptance` completed SUCCESS on main for commit `93f22b996b9d77ec0d8686ce5a30ec457dcc73a2`.

- PEOPLE-R1-N6 — PASS
  - Verification states remain separate from creator identity and creation source.
  - `partially_verified` / `verified` require accepted evidence; `self_verified` and `family_verified` require accepted self/family evidence respectively.
  - Every verification-status transition is written to an audit history with evidence linkage and reviewer identity when available.
  - Dedicated acceptance workflow `PEOPLE-R1 Node 6 Acceptance` completed SUCCESS on main for run `32038494451` at commit `3f5199eefb566649ab16a72737303e11e101374b`.

- PEOPLE-R1-N7 — PASS
  - Life status remains strictly `living | deceased | unknown`; no age-based or AI inference may set death status.
  - Changing a person to `deceased` requires accepted evidence scoped to death/life-status facts.
  - Dedicated acceptance workflow `PEOPLE-R1 Node 7 Acceptance` completed SUCCESS on main for run `32038566424` at commit `096a5cb39946047642b043630848ba41bd9b9ea5`.

- PEOPLE-R1-N8 — PASS
  - Self/family claim, supplement, correction, dispute and deletion request records are governed under RLS and bound to permanent person IDs.
  - Request evidence and status history are auditable; requesters may inspect only their own request/evidence surface while review remains server/editor controlled.
  - Relationship foundation reserves parent/child/spouse/sibling/grandparent/grandchild interfaces with private-by-default visibility; PEOPLE-R1 does not expose a genealogy tree.
  - Dedicated acceptance workflow `PEOPLE-R1 Node 8 Acceptance` completed SUCCESS on main for run `32041660386` at commit `42335a6da3ea734739d9c6133a6faaa0569769be`.

- PEOPLE-R1-N9 — PASS
  - High-sensitivity identifier patterns are publication-blocked; exact-address/privacy/safety concerns have an explicit moderation path.
  - Major or disputed facts cannot be accepted without an accepted evidence source bound to the same permanent person ID, and unresolved major disputes block publication.
  - Private record-version snapshots retain accepted source linkage; public RLS does not expose moderation/version history.
  - Dedicated acceptance workflow `PEOPLE-R1 Node 9 Acceptance` completed SUCCESS on main for run `32063525978` at commit `0e7bac66d39395ff84eb13d33d7bfaa0e292bb92`.

- PEOPLE-R1-N10 — PASS
  - N1-N9 were rerun in strict serial order by the final acceptance workflow.
  - Web independent product, Topic entry, search/disambiguation, mobile APP entry/feed, SEO markers, privacy, evidence governance, review and relationship-foundation constraints all passed together.
  - Final workflow `PEOPLE-R1 Node 10 Acceptance` completed SUCCESS on main for run `32063901572` and explicitly printed `PEOPLE-R1: 10/10 PASS`.

PEOPLE-R1: 10/10 PASS
