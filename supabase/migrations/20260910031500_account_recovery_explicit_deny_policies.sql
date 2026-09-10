begin;

create policy "account login identifiers server only"
  on public.account_login_identifiers
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "account recovery channels server only"
  on public.account_recovery_channels
  for all
  to anon, authenticated
  using (false)
  with check (false);

commit;
