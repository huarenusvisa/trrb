begin;

create extension if not exists pgcrypto;

-- Employment marketplace roles are product roles, not moderation/admin privileges.
alter table public.profiles
  add column if not exists active_job_role text
  check (active_job_role is null or active_job_role in ('employer','job_seeker'));

create table if not exists public.job_user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('employer','job_seeker')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.job_categories (
  slug text primary key,
  label_zh text not null unique,
  sort_order integer not null unique check (sort_order > 0),
  is_active boolean not null default true
);

insert into public.job_categories(slug,label_zh,sort_order) values
  ('restaurant','餐饮',1),
  ('beauty-nail','美甲/美容',2),
  ('massage','按摩',3),
  ('construction','装修/建筑',4),
  ('logistics-warehouse','物流/仓库',5),
  ('truck-driver','卡车/司机',6),
  ('retail-grocery','超市/零售',7),
  ('home-care','家政/护理',8),
  ('legal','律师/法律',9),
  ('accounting-finance','会计/金融',10),
  ('real-estate','地产',11),
  ('education','教育',12),
  ('it-tech','IT/科技',13),
  ('office-admin','办公室/行政',14),
  ('sales','销售',15),
  ('other','其他',16)
on conflict (slug) do update set
  label_zh=excluded.label_zh,
  sort_order=excluded.sort_order,
  is_active=true;

create table if not exists public.job_listings (
  id uuid primary key default gen_random_uuid(),
  employer_user_id uuid not null references public.profiles(id) on delete restrict,
  category_slug text not null references public.job_categories(slug),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 12000),
  employment_type text not null default 'unspecified'
    check (employment_type in ('full_time','part_time','contract','temporary','internship','unspecified')),
  salary_min numeric(12,2),
  salary_max numeric(12,2),
  salary_period text check (salary_period is null or salary_period in ('hour','day','week','month','year','job')),
  currency_code text not null default 'USD' check (currency_code='USD'),
  country_code text not null default 'US' check (country_code='US'),
  state_code text not null check (char_length(state_code) between 2 and 3),
  city text not null check (char_length(btrim(city)) between 1 and 120),
  county text,
  borough text,
  neighborhood text,
  postal_code text,
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  status text not null default 'draft'
    check (status in ('draft','open','filled','paused','unlisted','deleted')),
  published_at timestamptz,
  closed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_min is null or salary_min >= 0),
  check (salary_max is null or salary_max >= 0),
  check (salary_min is null or salary_max is null or salary_max >= salary_min),
  check ((latitude is null) = (longitude is null)),
  check (status <> 'deleted' or deleted_at is not null)
);

create index if not exists job_listings_status_created_idx
  on public.job_listings(status, created_at desc);
create index if not exists job_listings_owner_idx
  on public.job_listings(employer_user_id, created_at desc);
create index if not exists job_listings_location_idx
  on public.job_listings(state_code, city, borough, neighborhood);
create index if not exists job_listings_category_idx
  on public.job_listings(category_slug, status, created_at desc);

create table if not exists public.job_seeker_posts (
  id uuid primary key default gen_random_uuid(),
  seeker_user_id uuid not null references public.profiles(id) on delete restrict,
  category_slug text references public.job_categories(slug),
  headline text not null check (char_length(btrim(headline)) between 2 and 120),
  introduction text not null default '' check (char_length(introduction) <= 12000),
  desired_employment_type text not null default 'unspecified'
    check (desired_employment_type in ('full_time','part_time','contract','temporary','internship','unspecified')),
  country_code text not null default 'US' check (country_code='US'),
  state_code text not null check (char_length(state_code) between 2 and 3),
  city text not null check (char_length(btrim(city)) between 1 and 120),
  county text,
  borough text,
  neighborhood text,
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  status text not null default 'draft'
    check (status in ('draft','seeking','found','paused','unlisted','deleted')),
  published_at timestamptz,
  closed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (status <> 'deleted' or deleted_at is not null)
);

create index if not exists job_seeker_posts_status_created_idx
  on public.job_seeker_posts(status, created_at desc);
create index if not exists job_seeker_posts_owner_idx
  on public.job_seeker_posts(seeker_user_id, created_at desc);
create index if not exists job_seeker_posts_location_idx
  on public.job_seeker_posts(state_code, city, borough, neighborhood);

-- Keep active role honest: a user may own both roles, but the selected active role
-- must exist in job_user_roles. This does not imply identity or business verification.
create or replace function public.validate_active_job_role()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.active_job_role is not null and not exists (
    select 1 from public.job_user_roles r
    where r.user_id = new.id and r.role = new.active_job_role
  ) then
    raise exception 'active_job_role must be enabled in job_user_roles';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_validate_active_job_role on public.profiles;
create trigger profiles_validate_active_job_role
before insert or update of active_job_role on public.profiles
for each row execute function public.validate_active_job_role();

alter table public.job_user_roles enable row level security;
alter table public.job_categories enable row level security;
alter table public.job_listings enable row level security;
alter table public.job_seeker_posts enable row level security;

create policy "job roles owner read" on public.job_user_roles
  for select using (auth.uid()=user_id);
create policy "job roles owner insert" on public.job_user_roles
  for insert with check (auth.uid()=user_id);
create policy "job roles owner delete" on public.job_user_roles
  for delete using (auth.uid()=user_id);

create policy "job categories public read" on public.job_categories
  for select using (is_active=true);

-- Open and filled listings are public: filled preserves stable historical/SEO pages.
-- Paused/unlisted/draft/deleted listings remain owner-visible only.
create policy "job listings public current and history" on public.job_listings
  for select using (status in ('open','filled') or auth.uid()=employer_user_id);
create policy "job listings owner insert" on public.job_listings
  for insert with check (
    auth.uid()=employer_user_id and country_code='US' and exists (
      select 1 from public.job_user_roles r
      where r.user_id=auth.uid() and r.role='employer'
    )
  );
create policy "job listings owner update" on public.job_listings
  for update using (auth.uid()=employer_user_id)
  with check (auth.uid()=employer_user_id and country_code='US');

-- A seeker post remains public only while actively seeking. Found/paused/unlisted/deleted
-- records are retained for lifecycle/audit but are not exposed by the public RLS path.
create policy "job seeker posts public active" on public.job_seeker_posts
  for select using (status='seeking' or auth.uid()=seeker_user_id);
create policy "job seeker posts owner insert" on public.job_seeker_posts
  for insert with check (
    auth.uid()=seeker_user_id and country_code='US' and exists (
      select 1 from public.job_user_roles r
      where r.user_id=auth.uid() and r.role='job_seeker'
    )
  );
create policy "job seeker posts owner update" on public.job_seeker_posts
  for update using (auth.uid()=seeker_user_id)
  with check (auth.uid()=seeker_user_id and country_code='US');

comment on column public.profiles.active_job_role is
  'UI/product context only: employer or job_seeker. It is not a verification or moderation privilege.';
comment on table public.job_listings is
  'JOBS-R1 US-only recruiting listings. UUID id is permanent and must not change when title/status changes.';
comment on table public.job_seeker_posts is
  'JOBS-R1 US-only job-seeker posts. Sensitive contact/profile details belong in later protected contact/profile layers.';

commit;
