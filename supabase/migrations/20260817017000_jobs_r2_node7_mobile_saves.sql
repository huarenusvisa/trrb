begin;

create table if not exists public.job_listing_saves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.job_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index if not exists job_listing_saves_user_created_idx
  on public.job_listing_saves(user_id, created_at desc);

alter table public.job_listing_saves enable row level security;

drop policy if exists "job saves owner read" on public.job_listing_saves;
create policy "job saves owner read" on public.job_listing_saves
  for select using (auth.uid() = user_id);

drop policy if exists "job saves owner create" on public.job_listing_saves;
create policy "job saves owner create" on public.job_listing_saves
  for insert with check (auth.uid() = user_id);

drop policy if exists "job saves owner delete" on public.job_listing_saves;
create policy "job saves owner delete" on public.job_listing_saves
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.job_listing_saves to authenticated;

comment on table public.job_listing_saves is
  'JOBS-R2 N7 account-scoped saved jobs. Uses canonical job_listings and unified auth; it is not a second listings source.';

commit;