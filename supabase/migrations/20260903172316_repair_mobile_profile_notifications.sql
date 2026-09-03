begin;

-- The mobile profile editor selects and updates only presentation fields.
-- RLS still limits rows to active public profiles or the signed-in owner.
grant select(id, display_name, avatar_key, bio, status)
  on public.profiles to authenticated;
grant update(display_name, avatar_key, bio)
  on public.profiles to authenticated;

create table if not exists public.user_follows (
  follower_user_id uuid not null references public.profiles(id) on delete cascade,
  followed_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, followed_user_id),
  check (follower_user_id <> followed_user_id)
);

create table if not exists public.user_notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('comment_reply', 'comment_like', 'follow', 'system')),
  title text,
  body text,
  article_id text,
  comment_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx
  on public.user_notifications(user_id, created_at desc);
create index if not exists user_notifications_user_unread_idx
  on public.user_notifications(user_id, is_read, created_at desc);

alter table public.user_follows enable row level security;
alter table public.user_notifications enable row level security;

drop policy if exists "follow graph readable" on public.user_follows;
create policy "follow graph readable" on public.user_follows
  for select to authenticated using (true);
drop policy if exists "users create own follows" on public.user_follows;
create policy "users create own follows" on public.user_follows
  for insert to authenticated with check ((select auth.uid()) = follower_user_id);
drop policy if exists "users delete own follows" on public.user_follows;
create policy "users delete own follows" on public.user_follows
  for delete to authenticated using ((select auth.uid()) = follower_user_id);

drop policy if exists "users read own notifications" on public.user_notifications;
create policy "users read own notifications" on public.user_notifications
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "users mark own notifications read" on public.user_notifications;
create policy "users mark own notifications read" on public.user_notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.user_follows from anon, authenticated;
grant select, insert, delete on public.user_follows to authenticated;
grant select, insert, update, delete on public.user_follows to service_role;

revoke all on public.user_notifications from anon, authenticated;
grant select on public.user_notifications to authenticated;
grant update(is_read) on public.user_notifications to authenticated;
grant select, insert, update, delete on public.user_notifications to service_role;
grant usage, select on sequence public.user_notifications_id_seq to service_role;

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

revoke all on function public.notify_follow() from public, anon, authenticated;

commit;
