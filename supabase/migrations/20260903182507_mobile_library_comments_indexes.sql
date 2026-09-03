begin;

-- Cover the user-side foreign keys used during account deletion and abuse
-- review. These complete the production-closure migration after DB advisors.
create index if not exists comment_likes_user_idx
  on public.comment_likes(user_id);
create index if not exists comment_reports_reporter_idx
  on public.comment_reports(reporter_user_id, created_at desc);

commit;
