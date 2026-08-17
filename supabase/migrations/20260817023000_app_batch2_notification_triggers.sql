begin;

alter table public.user_notifications add column if not exists title text;
alter table public.user_notifications add column if not exists body text;

create or replace function public.notify_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_owner uuid;
begin
  if new.parent_id is null then return new; end if;
  select user_id into parent_owner from public.comments where id = new.parent_id;
  if parent_owner is null or parent_owner = new.user_id then return new; end if;
  insert into public.user_notifications(user_id, actor_user_id, type, title, body, article_id, comment_id)
  values(parent_owner, new.user_id, 'comment_reply', '有人回复了你', left(new.content, 180), new.article_id, new.id);
  return new;
end;
$$;

drop trigger if exists trg_notify_comment_reply on public.comments;
create trigger trg_notify_comment_reply after insert on public.comments
for each row execute function public.notify_comment_reply();

create or replace function public.notify_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  comment_owner uuid;
  linked_article uuid;
begin
  select user_id, article_id into comment_owner, linked_article from public.comments where id = new.comment_id;
  if comment_owner is null or comment_owner = new.user_id then return new; end if;
  insert into public.user_notifications(user_id, actor_user_id, type, title, article_id, comment_id)
  values(comment_owner, new.user_id, 'comment_like', '有人赞了你的评论', linked_article, new.comment_id);
  return new;
end;
$$;

drop trigger if exists trg_notify_comment_like on public.comment_likes;
create trigger trg_notify_comment_like after insert on public.comment_likes
for each row execute function public.notify_comment_like();

create or replace function public.notify_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.followed_user_id = new.follower_user_id then return new; end if;
  insert into public.user_notifications(user_id, actor_user_id, type, title)
  values(new.followed_user_id, new.follower_user_id, 'follow', '你有新的关注者');
  return new;
end;
$$;

drop trigger if exists trg_notify_follow on public.user_follows;
create trigger trg_notify_follow after insert on public.user_follows
for each row execute function public.notify_follow();

revoke all on function public.notify_comment_reply() from public, anon, authenticated;
revoke all on function public.notify_comment_like() from public, anon, authenticated;
revoke all on function public.notify_follow() from public, anon, authenticated;

commit;
