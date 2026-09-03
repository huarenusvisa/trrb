begin;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  breaking_news boolean not null default true,
  ice boolean not null default true,
  immigration boolean not null default true,
  legal boolean not null default true,
  community boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
drop policy if exists "users read own notification preferences" on public.notification_preferences;
create policy "users read own notification preferences" on public.notification_preferences
  for select using (auth.uid() = user_id);
drop policy if exists "users manage own notification preferences" on public.notification_preferences;
create policy "users manage own notification preferences" on public.notification_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.push_delivery_log (
  id bigint generated always as identity primary key,
  article_id bigint,
  category text not null,
  target_count integer not null default 0,
  accepted_count integer not null default 0,
  rejected_count integer not null default 0,
  actor_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.push_delivery_log enable row level security;
-- No client policies: delivery audit remains server/admin only.

create index if not exists push_tokens_enabled_platform_idx on public.push_tokens(enabled, platform);
create index if not exists push_delivery_log_created_idx on public.push_delivery_log(created_at desc);

commit;
