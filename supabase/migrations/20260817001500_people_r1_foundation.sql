begin;

create extension if not exists pgcrypto;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  primary_name text not null check (char_length(btrim(primary_name)) between 1 and 160),
  primary_name_normalized text not null check (char_length(btrim(primary_name_normalized)) between 1 and 200),
  summary text not null default '',
  biography text not null default '',
  birth_date date,
  birth_date_precision text not null default 'unknown' check (birth_date_precision in ('day','month','year','approximate','unknown')),
  death_date date,
  death_date_precision text not null default 'unknown' check (death_date_precision in ('day','month','year','approximate','unknown')),
  life_status text not null default 'unknown' check (life_status in ('living','deceased','unknown')),
  us_arrival_date date,
  us_arrival_date_precision text not null default 'unknown' check (us_arrival_date_precision in ('day','month','year','approximate','unknown')),
  us_arrival_story text not null default '',
  creator_user_id uuid references public.profiles(id) on delete set null,
  creator_type text not null check (creator_type in ('self','family_friend','netizen','editorial')),
  creator_relationship_label text not null default '',
  verification_status text not null default 'unverified' check (verification_status in ('unverified','partially_verified','verified','self_verified','family_verified')),
  publication_status text not null default 'draft' check (publication_status in ('draft','review','published','hidden','deleted')),
  record_version integer not null default 1 check (record_version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists people_name_normalized_idx on public.people(primary_name_normalized);
create index if not exists people_publication_idx on public.people(publication_status, updated_at desc);
create index if not exists people_life_status_idx on public.people(life_status);
create index if not exists people_verification_idx on public.people(verification_status);

create table if not exists public.people_aliases (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  alias_name text not null check (char_length(btrim(alias_name)) between 1 and 160),
  alias_normalized text not null check (char_length(btrim(alias_normalized)) between 1 and 200),
  alias_type text not null default 'other' check (alias_type in ('chinese','english','romanization','former','other')),
  language_code text not null default '',
  created_at timestamptz not null default now(),
  unique(person_id, alias_normalized, alias_type)
);
create index if not exists people_aliases_search_idx on public.people_aliases(alias_normalized);

create table if not exists public.people_us_regions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  state_code text not null check (char_length(state_code) between 2 and 3),
  city text not null default '',
  county_or_borough text not null default '',
  neighborhood text not null default '',
  start_year integer check (start_year is null or start_year between 1600 and 2200),
  end_year integer check (end_year is null or end_year between 1600 and 2200),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_year is null or start_year is null or end_year >= start_year)
);
create index if not exists people_us_regions_lookup_idx on public.people_us_regions(state_code, city, county_or_borough, neighborhood);

create table if not exists public.people_occupations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  occupation text not null check (char_length(btrim(occupation)) between 1 and 160),
  organization text not null default '',
  start_year integer check (start_year is null or start_year between 1600 and 2200),
  end_year integer check (end_year is null or end_year between 1600 and 2200),
  description text not null default '',
  created_at timestamptz not null default now(),
  check (end_year is null or start_year is null or end_year >= start_year)
);
create index if not exists people_occupations_lookup_idx on public.people_occupations(occupation);

create table if not exists public.people_achievements (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  description text not null default '',
  achievement_date date,
  date_precision text not null default 'unknown' check (date_precision in ('day','month','year','approximate','unknown')),
  created_at timestamptz not null default now()
);

create table if not exists public.people_timeline (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  event_date date,
  date_precision text not null default 'unknown' check (date_precision in ('day','month','year','approximate','unknown')),
  title text not null check (char_length(btrim(title)) between 1 and 240),
  description text not null default '',
  event_type text not null default 'life' check (event_type in ('birth','arrival_us','education','career','achievement','community','family','death','life','other')),
  created_at timestamptz not null default now()
);
create index if not exists people_timeline_person_date_idx on public.people_timeline(person_id, event_date);

create table if not exists public.people_sources (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  source_type text not null check (source_type in ('official','news','book','archive','organization','self','family','interview','other')),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  publisher text not null default '',
  source_url text not null default '',
  publication_date date,
  accessed_at timestamptz,
  fact_scope text[] not null default '{}',
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed','accepted','disputed','rejected')),
  notes text not null default '',
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists people_sources_person_idx on public.people_sources(person_id, review_status);

create or replace function public.people_keep_permanent_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'people.id is permanent and cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists people_permanent_id_guard on public.people;
create trigger people_permanent_id_guard
before update on public.people
for each row execute procedure public.people_keep_permanent_id();

alter table public.people enable row level security;
alter table public.people_aliases enable row level security;
alter table public.people_us_regions enable row level security;
alter table public.people_occupations enable row level security;
alter table public.people_achievements enable row level security;
alter table public.people_timeline enable row level security;
alter table public.people_sources enable row level security;

-- Public access is intentionally read-only and limited to published people.
drop policy if exists people_public_read on public.people;
create policy people_public_read on public.people for select using (publication_status = 'published');

drop policy if exists people_aliases_public_read on public.people_aliases;
create policy people_aliases_public_read on public.people_aliases for select using (
  exists(select 1 from public.people p where p.id = person_id and p.publication_status = 'published')
);
drop policy if exists people_regions_public_read on public.people_us_regions;
create policy people_regions_public_read on public.people_us_regions for select using (
  exists(select 1 from public.people p where p.id = person_id and p.publication_status = 'published')
);
drop policy if exists people_occupations_public_read on public.people_occupations;
create policy people_occupations_public_read on public.people_occupations for select using (
  exists(select 1 from public.people p where p.id = person_id and p.publication_status = 'published')
);
drop policy if exists people_achievements_public_read on public.people_achievements;
create policy people_achievements_public_read on public.people_achievements for select using (
  exists(select 1 from public.people p where p.id = person_id and p.publication_status = 'published')
);
drop policy if exists people_timeline_public_read on public.people_timeline;
create policy people_timeline_public_read on public.people_timeline for select using (
  exists(select 1 from public.people p where p.id = person_id and p.publication_status = 'published')
);
drop policy if exists people_sources_public_read on public.people_sources;
create policy people_sources_public_read on public.people_sources for select using (
  review_status = 'accepted' and exists(select 1 from public.people p where p.id = person_id and p.publication_status = 'published')
);

-- Creation/review writes are intentionally not opened by RLS here. Later PEOPLE nodes
-- must use authenticated/server-side flows with explicit moderation rules.

commit;
