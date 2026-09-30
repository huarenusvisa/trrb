# Manual publisher recovery, 2026-09-30

Application repair passed run 36686280632 (unit regression and PC/mobile browser simulations). Save requests use an actor-scoped deterministic primary key; ambiguous responses are re-read, not automatically resubmitted. Uploaded cover URLs are reused when retrying the same File. Original form text is retained after an unconfirmed response. Existing staff authorization and editorial guards remain enabled.

Database mitigation applied through Supabase migration `bound_homepage_pin_cleanup_to_expiry_index`: expire only indexed non-null due timestamps in batches of 50 with SKIP LOCKED, instead of scanning every article's metadata. Existing cron has an explicit 8-second statement budget; the API's exact 48-hour expiry logic remains unchanged.

A fixed-width title digest index was attempted but NOT confirmed installed. Blocking builds hit statement timeouts, and the existing session pooler failed with EAUTHQUERY/database connection unavailable. Do not describe the database as fully recovered or the screenshot's article as published without a real receipt.

The concurrent index repair script is under scripts/operations, not the automatically applied migrations folder, because it requires autocommit. It must be run only with the existing authorized database connection after connectivity is restored; no new account, key exposure or infrastructure upgrade is required by this script. Verify pg_index.indisvalid before switching the duplicate guard. No original article data was deleted.
