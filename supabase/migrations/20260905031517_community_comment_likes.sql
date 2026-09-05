begin;

alter table public.community_post_comments
  add column if not exists like_count integer not null default 0
  check (like_count >= 0);

create table if not exists public.community_post_comment_likes (
  comment_id uuid not null references public.community_post_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists community_post_comment_likes_user_idx
  on public.community_post_comment_likes(user_id);

alter table public.community_post_comment_likes enable row level security;

revoke all on public.community_post_comment_likes from anon, authenticated;
grant select, insert, delete on public.community_post_comment_likes to service_role;
grant select, update(like_count) on public.community_post_comments to service_role;

create or replace function public.sync_community_comment_like_count()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_post_comments
      set like_count = like_count + 1
      where id = new.comment_id;
    return new;
  end if;

  update public.community_post_comments
    set like_count = greatest(0, like_count - 1)
    where id = old.comment_id;
  return old;
end;
$$;

revoke all on function public.sync_community_comment_like_count() from public, anon, authenticated;
grant execute on function public.sync_community_comment_like_count() to service_role;

drop trigger if exists community_comment_like_count_insert on public.community_post_comment_likes;
create trigger community_comment_like_count_insert
after insert on public.community_post_comment_likes
for each row execute function public.sync_community_comment_like_count();

drop trigger if exists community_comment_like_count_delete on public.community_post_comment_likes;
create trigger community_comment_like_count_delete
after delete on public.community_post_comment_likes
for each row execute function public.sync_community_comment_like_count();

commit;
