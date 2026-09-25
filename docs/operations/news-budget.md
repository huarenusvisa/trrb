# Shared news budget and selection

The existing hourly ICE and China headlines jobs share one server-side budget. Every paid API module directly imports the shared fetch guard when the workflow budget flag is enabled; this also covers child processes, and meters X reads plus OpenAI Responses (research, writing, review, retries, update checks). It does not intercept other robots or browser traffic.

- Target: USD 1,000/month; metered API ceiling: USD 900. The remaining USD 100 is a buffer, not a guarantee about the entire provider invoice.
- Daily limit: the smaller of USD 30 and USD 900 divided by the month's days. Hourly burst allowance: daily limit / 12; X and each robot are capped at 60% of that burst, keeping research capacity available. Each robot may use at most 60% of the daily shared limit; X at most 60%, reserving room for research and editorial review.
- Lower priority discovery stops before the final 20% of the shared daily/monthly allowance; its X requests stop at 40% of the daily total.
- UTC accounting. Initial month is prorated from tracking start. Earlier usage is unknown, not zero. Website plans, tax and other applications are outside this ledger.
- Before every paid request, an atomic database reservation counts pending requests against all limits. Settlement uses reported token usage and returned X resource counts. Timeouts, ambiguous provider errors and failed settlement retain the full reservation. Duplicate settlement does not release additional money. Unknown models, tools, endpoints or unavailable accounting fail closed.
- Pricing reviewed 2026-09-25: GPT-4.1 mini input/cached/output USD 0.40/0.10/1.60 per million tokens; web search USD 0.01/call plus conservatively added 8K input block; X posts/users USD 0.005/0.010. X daily duplicate discounts are deliberately not assumed. These are conservative estimates, not imported invoices.
- Read the shared budget table in each workflow's job summary or call the service-role-only `news_budget_report` RPC. `unresolved_micros` is money reserved for unconfirmed calls; never release it automatically without provider evidence. Model/price changes require updating the estimator and tests first.

Collection keeps the strict 12-hour original-source cutoff, including government websites. Public official feeds run first; official and publisher evidence plus concrete actions and public/reader impact rank ahead of social opinion. Blue badges/followers do not verify facts. Extra monitored accounts use topic-filtered search and four hourly rotation groups; broad search also rotates every four hours. X result pages are limited to 20; existing monitored accounts are retained. User identity lookups are cached for 24 hours; news content is fetched fresh.

The ICE processing, normalization and final research queues rank eligible fresh candidates before paid calls. Unchanged evidence gets at most two final editorial attempts with an hour's backoff; new source material resets eligibility. Budget holds do not exhaust editorial retries. Human locks, independent factual review and nonofficial-source approval boundaries remain mandatory. Deep articles still require 2,000–3,500 Chinese characters and all source/data/upstream/downstream checks. Briefs can pass core review without pretending to satisfy deep-report checks.

Validation: Node budget/priority tests, editorial regression suite, live transactional RPC tests, simultaneous cross-pipeline reservation test and production workflow ledger inspection. To stop spending, set the budget policy `enabled=false` through an authorized service/admin operation; free feeds and scheduled checks can continue. No new cron or independent robot was added.


## Quality and throughput (2026-09-25)

The two existing robots keep the original-source 12-hour cutoff. Short reports and standard reports undergo factual, source-chain, temporal, legal and image-grounding checks; the eight deep-research dimensions apply only to 2,000–3,500-character deep reports. A missing analysis section is not an ungrounded analysis. A contradictory non-factual rejection receives one independent recheck, never a programmatic pass. Old-news flags receive a date/evidence recheck with explicit UTC and New York context.

Missing images trigger bounded source-page image discovery. Unmatched images never become a cover. A verified text-only report can enter ordinary lists with homepage focus excluded. Editorial failures retain original material and editable drafts. Duplicate events without material developments are still discarded; supported new developments update the existing URL. Manual edits lock out automation and require evidence and explicit fact/freshness confirmation to publish. These confirmations do not label the copy as independently reviewed deep journalism.

The rolling-seven-day deep share target is 30%, with 50% possible when evidence supports it. Neither the ratio nor the combined 100–200/day aspiration overrides a publication gate. The report counts unique new publication IDs and validates body length, independent sources, review flags and the reviewed content digest. Old-URL updates are excluded from new publication volume.

Priority calls may borrow elapsed-day unused allowance, with a burst ceiling of one quarter of the daily budget. Broad discovery retains the old hourly pace. Atomic reservations and daily/monthly/provider shares remain unchanged. This changes pacing, not the monthly spending ceiling.
