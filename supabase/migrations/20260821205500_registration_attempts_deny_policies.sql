begin;

-- The table is server-only. Explicit deny policies document that browser
-- clients never receive or create rate-limit records, even if grants change.
drop policy if exists account_registration_attempts_deny_anon on public.account_registration_attempts;
create policy account_registration_attempts_deny_anon
  on public.account_registration_attempts
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists account_registration_attempts_deny_authenticated on public.account_registration_attempts;
create policy account_registration_attempts_deny_authenticated
  on public.account_registration_attempts
  for all
  to authenticated
  using (false)
  with check (false);

commit;
