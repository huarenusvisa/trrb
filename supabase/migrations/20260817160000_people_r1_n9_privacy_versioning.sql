begin;

-- PEOPLE-R1-N9 privacy/safety governance. Public biography content must never expose
-- high-sensitivity identity/financial secrets. Exact private addresses are not modeled
-- anywhere in the public people schema; moderation can explicitly block publication
-- when reviewers detect address/privacy or other safety concerns.

create table if not exists public.people_moderation_cases (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  case_type text not null check (case_type in ('sensitive_data','exact_address','major_dispute','impersonation','defamation','privacy','safety','other')),
  fact_scope text[] not null default '{}',
  explanation text not null default '',
  blocks_publication boolean not null default true,
  status text not null default 'open' check (status in ('open','needs_evidence','resolved','rejected')),
  evidence_source_id uuid references public.people_sources(id) on delete set null,
  reporter_user_id uuid references public.profiles(id) on delete set null,
  reviewer_user_id uuid references public.profiles(id) on delete set null,
  reviewer_notes text not null default '',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists people_moderation_cases_person_idx on public.people_moderation_cases(person_id, status, created_at desc);

-- Major/contested facts are review-gated and must bind accepted evidence before acceptance.
create table if not exists public.people_major_fact_reviews (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  fact_key text not null check (char_length(btrim(fact_key)) between 1 and 160),
  fact_summary text not null check (char_length(btrim(fact_summary)) between 1 and 2000),
  review_status text not null default 'pending' check (review_status in ('pending','accepted','disputed','rejected')),
  evidence_source_id uuid not null references public.people_sources(id) on delete restrict,
  reviewer_user_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists people_major_fact_reviews_person_idx on public.people_major_fact_reviews(person_id, review_status);

create or replace function public.people_major_fact_requires_accepted_evidence()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_person uuid;
begin
  if new.review_status = 'accepted' then
    select review_status, person_id into v_status, v_person
      from public.people_sources where id = new.evidence_source_id;
    if v_status is distinct from 'accepted' or v_person is distinct from new.person_id then
      raise exception 'accepted major facts require an accepted evidence source for the same permanent person_id';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists people_major_fact_evidence_guard on public.people_major_fact_reviews;
create trigger people_major_fact_evidence_guard
before insert or update on public.people_major_fact_reviews
for each row execute procedure public.people_major_fact_requires_accepted_evidence();

-- Private immutable version trail. It is intentionally not exposed through public RLS.
create table if not exists public.people_record_versions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  snapshot jsonb not null,
  source_ids uuid[] not null default '{}',
  changed_by_user_id uuid references public.profiles(id) on delete set null,
  change_reason text not null default '',
  created_at timestamptz not null default now(),
  unique(person_id, version_number)
);
create index if not exists people_record_versions_person_idx on public.people_record_versions(person_id, version_number desc);

create or replace function public.people_public_text_has_sensitive_identifier(p_text text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_text,'') ~* '(\m\d{3}-\d{2}-\d{4}\M)|(\mA[- ]?\d{8,9}\M)|(social[ -]?security[ -]?(number|no\.?)[ :#-]*\d)|(bank[ -]?account[ :#-]*\d{5,})|(routing[ -]?(number|no\.?)[ :#-]*\d{9})|(verification[ -]?code[ :#-]*\d{4,8})|(验证码[：: ]*\d{4,8})';
$$;

create or replace function public.people_publication_safety_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.publication_status = 'published' then
    if public.people_public_text_has_sensitive_identifier(
      coalesce(new.primary_name,'') || ' ' || coalesce(new.summary,'') || ' ' || coalesce(new.biography,'') || ' ' || coalesce(new.us_arrival_story,'')
    ) then
      raise exception 'public biography contains a high-sensitivity identifier pattern';
    end if;
    if exists (
      select 1 from public.people_moderation_cases c
      where c.person_id = new.id and c.blocks_publication = true and c.status in ('open','needs_evidence')
    ) then
      raise exception 'publication blocked by unresolved privacy/safety/moderation case';
    end if;
    if exists (
      select 1 from public.people_major_fact_reviews f
      where f.person_id = new.id and f.review_status in ('pending','disputed')
    ) then
      raise exception 'publication blocked by unresolved major/disputed fact review';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists people_publication_safety_guard_trigger on public.people;
create trigger people_publication_safety_guard_trigger
before insert or update of publication_status, primary_name, summary, biography, us_arrival_story on public.people
for each row execute procedure public.people_publication_safety_guard();

create or replace function public.people_capture_record_version()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_next integer;
  v_sources uuid[];
begin
  if tg_op = 'INSERT' then
    v_next := new.record_version;
  else
    v_next := old.record_version + 1;
    new.record_version := v_next;
    new.updated_at := now();
  end if;
  select coalesce(array_agg(s.id order by s.created_at), '{}'::uuid[]) into v_sources
    from public.people_sources s where s.person_id = new.id and s.review_status = 'accepted';
  return new;
end;
$$;

-- Increment version before update, then capture the complete private snapshot after write.
drop trigger if exists people_record_version_increment on public.people;
create trigger people_record_version_increment
before update on public.people
for each row execute procedure public.people_capture_record_version();

create or replace function public.people_store_record_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sources uuid[];
begin
  select coalesce(array_agg(s.id order by s.created_at), '{}'::uuid[]) into v_sources
    from public.people_sources s where s.person_id = new.id and s.review_status = 'accepted';
  insert into public.people_record_versions(person_id, version_number, snapshot, source_ids, changed_by_user_id)
  values(new.id, new.record_version, to_jsonb(new), v_sources, auth.uid())
  on conflict (person_id, version_number) do nothing;
  return new;
end;
$$;
drop trigger if exists people_record_version_store on public.people;
create trigger people_record_version_store
after insert or update on public.people
for each row execute procedure public.people_store_record_version();

alter table public.people_moderation_cases enable row level security;
alter table public.people_major_fact_reviews enable row level security;
alter table public.people_record_versions enable row level security;

-- Ordinary authenticated reporters may submit a moderation concern and inspect only their own report.
drop policy if exists people_moderation_cases_own_insert on public.people_moderation_cases;
create policy people_moderation_cases_own_insert on public.people_moderation_cases for insert to authenticated
with check (reporter_user_id = auth.uid() and status = 'open');
drop policy if exists people_moderation_cases_own_read on public.people_moderation_cases;
create policy people_moderation_cases_own_read on public.people_moderation_cases for select to authenticated
using (reporter_user_id = auth.uid());

-- No public policies are created for major-fact review or version history; review/version data stay private.
-- Existing public source access remains limited to accepted sources tied to a published person.
-- N9 preserves source/evidence rows rather than deleting history when a biography changes.

commit;
