begin;

alter table public.user_notifications
  add column if not exists community_post_id uuid
    references public.community_posts(id) on delete set null,
  add column if not exists community_comment_id uuid
    references public.community_post_comments(id) on delete set null;

alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table public.user_notifications
  add constraint user_notifications_type_check check (
    type in (
      'comment_reply', 'comment_like', 'community_reply', 'community_post_like',
      'community_comment_like', 'community_report', 'follow', 'follow_request',
      'follow_accept', 'message_request', 'message', 'system'
    )
  );

create index if not exists user_notifications_community_post_idx
  on public.user_notifications(community_post_id, created_at desc)
  where community_post_id is not null;

create index if not exists user_notifications_community_comment_idx
  on public.user_notifications(community_comment_id, created_at desc)
  where community_comment_id is not null;

create or replace function public.notify_community_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_owner uuid;
begin
  if new.parent_id is null or new.status <> 'published' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' then return new; end if;

  select user_id into parent_owner
  from public.community_post_comments
  where id = new.parent_id;

  if parent_owner is null or parent_owner = new.user_id then return new; end if;
  insert into public.user_notifications(
    user_id, actor_user_id, type, title, body, community_post_id, community_comment_id
  ) values (
    parent_owner, new.user_id, 'community_reply', '有人回复了你的社区评论',
    left(new.content, 160), new.post_id, new.id
  );
  return new;
end;
$$;

create or replace function public.notify_community_post_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner uuid;
begin
  select user_id into post_owner
  from public.community_posts
  where id = new.post_id and status = 'published';

  if post_owner is null or post_owner = new.user_id then return new; end if;
  insert into public.user_notifications(
    user_id, actor_user_id, type, title, community_post_id
  ) values (
    post_owner, new.user_id, 'community_post_like', '有人赞了你的社区帖子', new.post_id
  );
  return new;
end;
$$;

create or replace function public.notify_community_comment_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  comment_owner uuid;
  linked_post uuid;
begin
  select user_id, post_id into comment_owner, linked_post
  from public.community_post_comments
  where id = new.comment_id and status = 'published';

  if comment_owner is null or comment_owner = new.user_id then return new; end if;
  insert into public.user_notifications(
    user_id, actor_user_id, type, title, community_post_id, community_comment_id
  ) values (
    comment_owner, new.user_id, 'community_comment_like',
    '有人赞了你的社区评论', linked_post, new.comment_id
  );
  return new;
end;
$$;

revoke all on function public.notify_community_reply() from public, anon, authenticated;
revoke all on function public.notify_community_post_like() from public, anon, authenticated;
revoke all on function public.notify_community_comment_like() from public, anon, authenticated;

drop trigger if exists community_reply_notification on public.community_post_comments;
create trigger community_reply_notification
after insert or update of status on public.community_post_comments
for each row execute function public.notify_community_reply();

drop trigger if exists community_post_like_notification on public.community_post_likes;
create trigger community_post_like_notification
after insert on public.community_post_likes
for each row execute function public.notify_community_post_like();

drop trigger if exists community_comment_like_notification on public.community_post_comment_likes;
create trigger community_comment_like_notification
after insert on public.community_post_comment_likes
for each row execute function public.notify_community_comment_like();

commit;
