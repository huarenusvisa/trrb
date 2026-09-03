begin;

create table if not exists public.push_tokens (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios','android')),
  expo_push_token text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

alter table public.push_tokens enable row level security;

drop policy if exists "users read own push tokens" on public.push_tokens;
create policy "users read own push tokens" on public.push_tokens for select using (auth.uid() = user_id);
drop policy if exists "users manage own push tokens" on public.push_tokens;
create policy "users manage own push tokens" on public.push_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

commit;
