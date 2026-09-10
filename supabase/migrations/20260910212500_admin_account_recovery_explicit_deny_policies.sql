drop policy if exists "account recovery admin actions deny select" on public.account_recovery_admin_actions;
create policy "account recovery admin actions deny select"
  on public.account_recovery_admin_actions for select
  to anon, authenticated
  using (false);

drop policy if exists "account recovery admin actions deny insert" on public.account_recovery_admin_actions;
create policy "account recovery admin actions deny insert"
  on public.account_recovery_admin_actions for insert
  to anon, authenticated
  with check (false);

drop policy if exists "account recovery admin actions deny update" on public.account_recovery_admin_actions;
create policy "account recovery admin actions deny update"
  on public.account_recovery_admin_actions for update
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "account recovery admin actions deny delete" on public.account_recovery_admin_actions;
create policy "account recovery admin actions deny delete"
  on public.account_recovery_admin_actions for delete
  to anon, authenticated
  using (false);
