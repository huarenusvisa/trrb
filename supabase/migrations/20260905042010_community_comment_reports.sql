begin;

alter table public.community_post_reports
  alter column post_id drop not null,
  add column if not exists comment_id uuid
    references public.community_post_comments(id) on delete cascade;

alter table public.community_post_reports
  drop constraint if exists community_post_reports_post_id_reporter_user_id_key,
  drop constraint if exists community_post_reports_target_check;

alter table public.community_post_reports
  add constraint community_post_reports_target_check
  check (num_nonnulls(post_id, comment_id) = 1);

create unique index if not exists community_post_reports_post_reporter_key
  on public.community_post_reports(post_id, reporter_user_id)
  where post_id is not null;

create unique index if not exists community_post_reports_comment_reporter_key
  on public.community_post_reports(comment_id, reporter_user_id)
  where comment_id is not null;

create index if not exists community_post_reports_comment_idx
  on public.community_post_reports(comment_id)
  where comment_id is not null;

grant select, insert, update, delete on public.community_post_reports to service_role;

commit;
