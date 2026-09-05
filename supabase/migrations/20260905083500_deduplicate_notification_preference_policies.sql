begin;

-- The existing owner-only FOR ALL policy already covers SELECT. Keeping a
-- second owner-only SELECT policy makes Postgres evaluate two permissive
-- policies for every preference read without granting any additional access.
drop policy if exists "users read own notification preferences"
  on public.notification_preferences;

commit;
