begin;

-- JOBS-R1-N1 extends the existing Supabase Auth + public.profiles identity.
-- Product roles are intentionally separate from profiles.role (platform/admin authorization).

create table if not exists public.job_user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_employer boolean not null default false,
  is_job_seeker boolean not null default false,
  active_role text check (active_role in ('employer','job_seeker')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    active_role is null
    or (active_role='employer' and is_employer)
    or (active_role='job_seeker' and is_job_seeker)
  )
);

create table if not exists public.job_postings (
  id uuid primary key default gen_random_uuid(),
  employer_user_id uuid not null references public.profiles(id) on delete cascade,
  country_code text not null default 'US' check (country_code='US'),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  category text not null check (category in ('餐饮','美甲/美容','按摩','装修/建筑','物流/仓库','卡车/司机','超市/零售','家政/护理','律师/法律','会计/金融','地产','教育','IT/科技','办公室/行政','销售','其他')),
  employment_type text not null check (employment_type in ('full_time','part_time','contract','temporary','internship','other')),
  description text not null default '' check (char_length(description) <= 12000),
  state_code text,
  city text,
  county_or_borough text,
  neighborhood text,
  postal_code text,
  latitude double precision check (latitude is null or latitude between 18 and 72),
  longitude double precision check (longitude is null or longitude between -180 and -65),
  salary_min numeric(12,2) check (salary_min is null or salary_min >= 0),
  salary_max numeric(12,2) check (salary_max is null or salary_max >= 0),
  salary_period text check (salary_period is null or salary_period in ('hour','day','week','month','year','project')),
  status text not null default 'draft' check (status in ('draft','recruiting','filled','paused','delisted','deleted')),
  published_at timestamptz,
  closed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (salary_min is null or salary_max is null or salary_max >= salary_min),
  check ((status='deleted' and deleted_at is not null) or status<>'deleted')
);

create index if not exists job_postings_live_geo_idx on public.job_postings(status,state_code,city,county_or_borough,neighborhood);
create index if not exists job_postings_employer_idx on public.job_postings(employer_user_id,created_at desc);
create index if not exists job_postings_category_idx on public.job_postings(category,status,created_at desc);

create table if not exists public.job_seeker_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  country_code text not null default 'US' check (country_code='US'),
  headline text not null check (char_length(btrim(headline)) between 2 and 160),
  target_category text not null check (target_category in ('餐饮','美甲/美容','按摩','装修/建筑','物流/仓库','卡车/司机','超市/零售','家政/护理','律师/法律','会计/金融','地产','教育','IT/科技','办公室/行政','销售','其他')),
  target_employment_type text check (target_employment_type is null or target_employment_type in ('full_time','part_time','contract','temporary','internship','other')),
  experience_summary text not null default '' check (char_length(experience_summary) <= 8000),
  introduction text not null default '' check (char_length(introduction) <= 5000),
  state_code text,
  city text,
  county_or_borough text,
  neighborhood text,
  postal_code text,
  latitude double precision check (latitude is null or latitude between 18 and 72),
  longitude double precision check (longitude is null or longitude between -180 and -65),
  status text not null default 'draft' check (status in ('draft','seeking','found','paused','delisted','deleted')),
  published_at timestamptz,
  closed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='deleted' and deleted_at is not null) or status<>'deleted')
);

create index if not exists job_seeker_live_geo_idx on public.job_seeker_listings(status,state_code,city,county_or_borough,neighborhood);
create index if not exists job_seeker_user_idx on public.job_seeker_listings(user_id,created_at desc);
create index if not exists job_seeker_category_idx on public.job_seeker_listings(target_category,status,created_at desc);

-- Stable UUIDs above are permanent identifiers: edits/relisting mutate status/content, never IDs.
-- Safety/audit tables are added in later JOBS nodes and are not coupled to destructive content deletion.

alter table public.job_user_roles enable row level security;
alter table public.job_postings enable row level security;
alter table public.job_seeker_listings enable row level security;

create policy "job roles owner read" on public.job_user_roles for select using (auth.uid()=user_id);
create policy "job roles owner insert" on public.job_user_roles for insert with check (auth.uid()=user_id);
create policy "job roles owner update" on public.job_user_roles for update using (auth.uid()=user_id) with check (auth.uid()=user_id);

create policy "job postings public live read" on public.job_postings for select using (status in ('recruiting','filled','paused'));
create policy "job postings owner read" on public.job_postings for select using (auth.uid()=employer_user_id);
create policy "job postings owner insert" on public.job_postings for insert with check (auth.uid()=employer_user_id and country_code='US');
create policy "job postings owner update" on public.job_postings for update using (auth.uid()=employer_user_id) with check (auth.uid()=employer_user_id and country_code='US');

create policy "job seeker public live read" on public.job_seeker_listings for select using (status in ('seeking','found','paused'));
create policy "job seeker owner read" on public.job_seeker_listings for select using (auth.uid()=user_id);
create policy "job seeker owner insert" on public.job_seeker_listings for insert with check (auth.uid()=user_id and country_code='US');
create policy "job seeker owner update" on public.job_seeker_listings for update using (auth.uid()=user_id) with check (auth.uid()=user_id and country_code='US');

commit;
