begin;

alter table public.profile_posts
  drop constraint if exists profile_posts_tags_count_check;

alter table public.profile_posts
  add constraint profile_posts_tags_count_check
  check (cardinality(tags) <= 5);

commit;