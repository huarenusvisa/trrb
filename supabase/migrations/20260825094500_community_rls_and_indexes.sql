begin;

drop policy if exists "community posts public read" on public.community_posts;
create policy "community posts public read" on public.community_posts
  for select to anon, authenticated
  using (status='published' or (select auth.uid())=user_id);

drop policy if exists "community comments public read" on public.community_post_comments;
create policy "community comments public read" on public.community_post_comments
  for select to anon, authenticated
  using (status='published' or (select auth.uid())=user_id);

drop policy if exists "community reports owner read" on public.community_post_reports;
create policy "community reports owner read" on public.community_post_reports
  for select to authenticated using ((select auth.uid())=reporter_user_id);

create index if not exists community_post_comments_parent_idx
  on public.community_post_comments(parent_id);
create index if not exists community_post_likes_user_idx
  on public.community_post_likes(user_id);
create index if not exists community_post_reports_reporter_idx
  on public.community_post_reports(reporter_user_id);
create index if not exists community_moderation_actor_idx
  on public.community_moderation_actions(actor_user_id);
create index if not exists community_moderation_post_idx
  on public.community_moderation_actions(post_id);
create index if not exists community_moderation_comment_idx
  on public.community_moderation_actions(comment_id);

commit;
