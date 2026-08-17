begin;

create table if not exists public.people_profile_requests (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('claim','supplement','correction','dispute','deletion')),
  requester_relationship text not null default 'other' check (requester_relationship in ('self','parent','child','spouse','sibling','grandparent','grandchild','family','friend','other')),
  requested_changes jsonb not null default '{}'::jsonb,
  explanation text not null default '',
  status text not null default 'pending' check (status in ('pending','needs_evidence','approved','partially_approved','rejected','withdrawn')),
  reviewer_user_id uuid references public.profiles(id) on delete set null,
  reviewer_notes text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists people_profile_requests_person_idx on public.people_profile_requests(person_id, status, created_at desc);
create index if not exists people_profile_requests_requester_idx on public.people_profile_requests(requester_user_id, created_at desc);

create table if not exists public.people_profile_request_evidence (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.people_profile_requests(id) on delete cascade,
  source_id uuid references public.people_sources(id) on delete set null,
  evidence_kind text not null check (evidence_kind in ('identity','relationship','correction','dispute','deletion_basis','other')),
  private_reference text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.people_profile_request_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.people_profile_requests(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Relationship graph foundation only. PEOPLE-R1 does not render a genealogy/family tree.
-- Duplicate names are safe because both endpoints bind permanent people.id values.
create table if not exists public.people_relationships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  related_person_id uuid not null references public.people(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('parent','child','spouse','sibling','grandparent','grandchild','other_family')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','pending','verified','disputed')),
  visibility text not null default 'private' check (visibility in ('private','family','public')),
  created_by_user_id uuid references public.profiles(id) on delete set null,
  verified_by_family boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (person_id <> related_person_id),
  unique(person_id, related_person_id, relationship_type)
);
create index if not exists people_relationships_person_idx on public.people_relationships(person_id, verification_status);
create index if not exists people_relationships_related_idx on public.people_relationships(related_person_id, verification_status);

alter table public.people_profile_requests enable row level security;
alter table public.people_profile_request_evidence enable row level security;
alter table public.people_profile_request_history enable row level security;
alter table public.people_relationships enable row level security;

-- Requesters can create and inspect their own requests. Review/approval remains server/editor controlled.
drop policy if exists people_profile_requests_own_read on public.people_profile_requests;
create policy people_profile_requests_own_read on public.people_profile_requests for select to authenticated using (requester_user_id = auth.uid());
drop policy if exists people_profile_requests_own_insert on public.people_profile_requests;
create policy people_profile_requests_own_insert on public.people_profile_requests for insert to authenticated with check (requester_user_id = auth.uid());

drop policy if exists people_profile_request_evidence_own_read on public.people_profile_request_evidence;
create policy people_profile_request_evidence_own_read on public.people_profile_request_evidence for select to authenticated using (
  exists(select 1 from public.people_profile_requests r where r.id = request_id and r.requester_user_id = auth.uid())
);
drop policy if exists people_profile_request_evidence_own_insert on public.people_profile_request_evidence;
create policy people_profile_request_evidence_own_insert on public.people_profile_request_evidence for insert to authenticated with check (
  exists(select 1 from public.people_profile_requests r where r.id = request_id and r.requester_user_id = auth.uid() and r.status in ('pending','needs_evidence'))
);

-- Relationship rows are not publicly readable by default. A later reviewed surface may expose only public + verified links.

commit;
