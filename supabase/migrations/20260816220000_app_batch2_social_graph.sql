begin;

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
  type text not null check (type in ('comment_reply','comment_like','follow','system')),
  article_id uuid null,
  comment_id uuid references public.comments(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_created_idx on public.user_notifications(user_id, created_at desc);
create index if not exists user_notifications_user_unread_idx on public.user_notifications(user_id, is_read, created_at desc);

alter table public.user_follows enable row level security;
alter table public.user_notifications enable row level security;

drop policy if exists "follow graph readable" on public.user_follows;
create policy "follow graph readable" on public.user_follows for select using (true);
drop policy if exists "users manage own follows" on public.user_follows;
create policy "users manage own follows" on public.user_follows for all using (auth.uid() = follower_user_id) with check (auth.uid() = follower_user_id);

drop policy if exists "users read own notifications" on public.user_notifications;
create policy "users read own notifications" on public.user_notifications for select using (auth.uid() = user_id);
drop policy if exists "users mark own notifications read" on public.user_notifications;
create policy "users mark own notifications read" on public.user_notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;
