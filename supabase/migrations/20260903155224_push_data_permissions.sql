begin;

-- Client-facing tables: signed-in users can manage only their own rows through RLS.
revoke all on table public.push_tokens from anon, authenticated;
grant select, insert, update, delete on table public.push_tokens to authenticated;

revoke all on table public.notification_preferences from anon, authenticated;
grant select, insert, update, delete on table public.notification_preferences to authenticated;

drop policy if exists "users read own push tokens" on public.push_tokens;
create policy "users read own push tokens"
  on public.push_tokens
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users manage own push tokens" on public.push_tokens;
create policy "users manage own push tokens"
  on public.push_tokens
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users read own notification preferences" on public.notification_preferences;
create policy "users read own notification preferences"
  on public.notification_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users manage own notification preferences" on public.notification_preferences;
create policy "users manage own notification preferences"
  on public.notification_preferences
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Identity sequences must not be callable anonymously.
revoke all on sequence public.push_tokens_id_seq from anon, authenticated;
grant usage, select on sequence public.push_tokens_id_seq to authenticated;

-- Operational delivery data is server-only. RLS remains enabled as defense in depth.
revoke all on table public.push_delivery_log from anon, authenticated;
revoke all on table public.push_ticket_receipts from anon, authenticated;
revoke all on sequence public.push_delivery_log_id_seq from anon, authenticated;
revoke all on sequence public.push_ticket_receipts_id_seq from anon, authenticated;

grant select, insert, update, delete on table public.push_tokens to service_role;
grant select, insert, update, delete on table public.notification_preferences to service_role;
grant select, insert, update, delete on table public.push_delivery_log to service_role;
grant select, insert, update, delete on table public.push_ticket_receipts to service_role;
grant usage, select on sequence public.push_tokens_id_seq to service_role;
grant usage, select on sequence public.push_delivery_log_id_seq to service_role;
grant usage, select on sequence public.push_ticket_receipts_id_seq to service_role;

commit;
