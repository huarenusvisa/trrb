begin;

-- JOBS-R2 N1: one account-level search center shared by Web/APP.
-- This is deliberately a job-search preference, never a home-address record.
create table if not exists public.job_search_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  mode text not null
    check (mode in ('current_location','fixed_location','zip','region','all_us')),
  source text not null
    check (source in ('device_geolocation','manual_zip','manual_region','manual_map','ip_coarse','all_us')),
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  public_label text check (public_label is null or char_length(public_label) <= 160),
  postal_code text check (postal_code is null or char_length(postal_code) between 3 and 10),
  state_code text check (state_code is null or char_length(state_code) between 2 and 3),
  city text check (city is null or char_length(city) <= 120),
  county text check (county is null or char_length(county) <= 120),
  borough text check (borough is null or char_length(borough) <= 120),
  neighborhood text check (neighborhood is null or char_length(neighborhood) <= 120),
  metro_slug text check (metro_slug is null or char_length(metro_slug) <= 120),
  accuracy_meters numeric(12,2) check (accuracy_meters is null or accuracy_meters >= 0),
  location_consent_at timestamptz,
  follow_current_location boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  -- Browser/App precise coordinates are valid only after explicit device permission.
  check (source <> 'device_geolocation' or location_consent_at is not null),
  check (mode <> 'current_location' or source = 'device_geolocation'),
  check (mode <> 'current_location' or (latitude is not null and longitude is not null)),
  check (mode <> 'zip' or source = 'manual_zip'),
  check (mode <> 'zip' or postal_code is not null),
  check (mode <> 'region' or source in ('manual_region','manual_map','ip_coarse')),
  check (mode <> 'all_us' or source = 'all_us'),
  check (mode <> 'all_us' or (latitude is null and longitude is null)),
  -- IP is only a coarse regional hint and may never masquerade as precise coordinates.
  check (source <> 'ip_coarse' or (latitude is null and longitude is null and accuracy_meters is null)),
  -- Follow-current is meaningful only for explicitly authorized device location.
  check (not follow_current_location or (mode = 'current_location' and source = 'device_geolocation'))
);

create index if not exists job_search_locations_region_idx
  on public.job_search_locations(state_code, city, borough, neighborhood);
create index if not exists job_search_locations_metro_idx
  on public.job_search_locations(metro_slug);

alter table public.job_search_locations enable row level security;

create policy "job search location owner read" on public.job_search_locations
  for select using (auth.uid() = user_id);
create policy "job search location owner insert" on public.job_search_locations
  for insert with check (auth.uid() = user_id);
create policy "job search location owner update" on public.job_search_locations
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "job search location owner delete" on public.job_search_locations
  for delete using (auth.uid() = user_id);

-- Keep timestamps consistent without introducing a second identity/profile system.
create or replace function public.touch_job_search_location_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_search_locations_touch_updated_at on public.job_search_locations;
create trigger job_search_locations_touch_updated_at
before update on public.job_search_locations
for each row execute function public.touch_job_search_location_updated_at();

comment on table public.job_search_locations is
  'JOBS-R2 account-synced job-search center. It is a search preference, not a home-address record.';
comment on column public.job_search_locations.source is
  'device_geolocation requires explicit browser/App permission; ip_coarse is fallback only and cannot store precise coordinates.';
comment on column public.job_search_locations.public_label is
  'Human-readable job-search area label such as Flushing, Queens or San Francisco Bay Area; never require a street/home address.';

commit;
