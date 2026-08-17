begin;

create table if not exists public.job_search_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  mode text not null default 'all_us' check (mode in ('current_location','fixed_location','zip','region','all_us')),
  country_code text not null default 'US' check (country_code='US'),
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  label text check (label is null or char_length(label) <= 160),
  state_code text,
  city text,
  county text,
  borough text,
  neighborhood text,
  postal_code text,
  source text not null default 'manual_region' check (source in ('device_permission','manual_zip','manual_region','account_sync','ip_coarse','all_us')),
  follow_current_location boolean not null default false,
  precision text not null default 'region' check (precision in ('exact_device','zip','region','coarse_ip','none')),
  device_permission_granted boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (mode <> 'current_location' or source = 'device_permission'),
  check (source <> 'device_permission' or device_permission_granted = true),
  check (precision <> 'exact_device' or device_permission_granted = true),
  check (source <> 'ip_coarse' or precision = 'coarse_ip'),
  check (mode <> 'all_us' or (latitude is null and longitude is null and precision = 'none')),
  check (follow_current_location = false or (mode='current_location' and device_permission_granted=true))
);

create index if not exists job_search_locations_mode_idx on public.job_search_locations(mode, updated_at desc);
create index if not exists job_search_locations_region_idx on public.job_search_locations(state_code, city, borough, neighborhood);

alter table public.job_search_locations enable row level security;

create policy "job search location owner read" on public.job_search_locations for select using (auth.uid()=user_id);
create policy "job search location owner insert" on public.job_search_locations for insert with check (auth.uid()=user_id and country_code='US');
create policy "job search location owner update" on public.job_search_locations for update using (auth.uid()=user_id) with check (auth.uid()=user_id and country_code='US');
create policy "job search location owner delete" on public.job_search_locations for delete using (auth.uid()=user_id);

create or replace function public.touch_job_search_location_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists job_search_locations_touch_updated_at on public.job_search_locations;
create trigger job_search_locations_touch_updated_at before update on public.job_search_locations for each row execute function public.touch_job_search_location_updated_at();

comment on table public.job_search_locations is 'JOBS-R2 account-synced job-search center. It is a search preference, not a home/residential address.';
comment on column public.job_search_locations.source is 'device_permission requires explicit user location permission; ip_coarse is recommendation fallback only and must never be represented as GPS.';
comment on column public.job_search_locations.follow_current_location is 'When true, refresh the search center only after device location permission is granted.';

commit;
