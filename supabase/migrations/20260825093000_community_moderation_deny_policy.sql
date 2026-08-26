begin;

drop policy if exists "community moderation no client access" on public.community_moderation_actions;
create policy "community moderation no client access"
  on public.community_moderation_actions
  for all to anon, authenticated
  using (false)
  with check (false);

commit;
