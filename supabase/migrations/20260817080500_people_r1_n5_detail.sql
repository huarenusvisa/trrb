begin;

create table if not exists public.people_photos (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  image_url text not null check (char_length(btrim(image_url)) between 1 and 2000),
  caption text not null default '',
  approximate_year integer check (approximate_year is null or approximate_year between 1600 and 2200),
  source_id uuid references public.people_sources(id) on delete set null,
  is_primary boolean not null default false,
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed','accepted','disputed','rejected')),
  created_at timestamptz not null default now()
);
create unique index if not exists people_one_primary_photo_idx on public.people_photos(person_id) where is_primary and review_status = 'accepted';
create index if not exists people_photos_person_idx on public.people_photos(person_id, created_at);

create table if not exists public.people_stories (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  story text not null check (char_length(btrim(story)) between 1 and 30000),
  story_year integer check (story_year is null or story_year between 1600 and 2200),
  source_id uuid references public.people_sources(id) on delete set null,
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed','accepted','disputed','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists people_stories_person_idx on public.people_stories(person_id, story_year, created_at);

alter table public.people_photos enable row level security;
alter table public.people_stories enable row level security;

drop policy if exists people_photos_public_read on public.people_photos;
create policy people_photos_public_read on public.people_photos for select using (
  review_status = 'accepted' and exists(select 1 from public.people p where p.id = person_id and p.publication_status = 'published')
);

drop policy if exists people_stories_public_read on public.people_stories;
create policy people_stories_public_read on public.people_stories for select using (
  review_status = 'accepted' and exists(select 1 from public.people p where p.id = person_id and p.publication_status = 'published')
);

create or replace function public.get_public_person_detail(p_person_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'person', to_jsonb(p),
    'regions', coalesce((select jsonb_agg(to_jsonb(r) order by r.start_year nulls last) from public.people_us_regions r where r.person_id=p.id),'[]'::jsonb),
    'occupations', coalesce((select jsonb_agg(to_jsonb(o) order by o.start_year nulls last) from public.people_occupations o where o.person_id=p.id),'[]'::jsonb),
    'achievements', coalesce((select jsonb_agg(to_jsonb(a) order by a.achievement_date nulls last) from public.people_achievements a where a.person_id=p.id),'[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(to_jsonb(t) order by t.event_date nulls last, t.created_at) from public.people_timeline t where t.person_id=p.id),'[]'::jsonb),
    'photos', coalesce((select jsonb_agg(to_jsonb(ph) order by ph.is_primary desc, ph.approximate_year nulls last) from public.people_photos ph where ph.person_id=p.id),'[]'::jsonb),
    'stories', coalesce((select jsonb_agg(to_jsonb(s) order by s.story_year nulls last, s.created_at) from public.people_stories s where s.person_id=p.id),'[]'::jsonb)
  )
  from public.people p
  where p.id=p_person_id and p.publication_status='published';
$$;

grant execute on function public.get_public_person_detail(uuid) to anon, authenticated;

commit;
