begin;

create table if not exists public.people_verification_events (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  from_status text not null check (from_status in ('unverified','partially_verified','verified','self_verified','family_verified')),
  to_status text not null check (to_status in ('unverified','partially_verified','verified','self_verified','family_verified')),
  evidence_source_id uuid references public.people_sources(id) on delete set null,
  reviewer_user_id uuid references public.profiles(id) on delete set null,
  review_note text not null default '' check (char_length(review_note) <= 4000),
  created_at timestamptz not null default now(),
  check (from_status <> to_status)
);
create index if not exists people_verification_events_person_idx
  on public.people_verification_events(person_id, created_at desc);

alter table public.people_verification_events enable row level security;
-- Verification history is moderation/audit data. No anonymous write or broad public read policy is opened here.

create or replace function public.people_validate_verification_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  has_any_accepted boolean;
  has_self_accepted boolean;
  has_family_accepted boolean;
begin
  if new.verification_status is not distinct from old.verification_status then
    return new;
  end if;

  -- Creator identity never confers verification. Verification must be backed by separately reviewed evidence.
  if new.verification_status = 'unverified' then
    return new;
  end if;

  select
    exists(select 1 from public.people_sources s where s.person_id = old.id and s.review_status = 'accepted'),
    exists(select 1 from public.people_sources s where s.person_id = old.id and s.review_status = 'accepted' and s.source_type = 'self'),
    exists(select 1 from public.people_sources s where s.person_id = old.id and s.review_status = 'accepted' and s.source_type = 'family')
  into has_any_accepted, has_self_accepted, has_family_accepted;

  if new.verification_status in ('partially_verified','verified') and not has_any_accepted then
    raise exception 'verification status % requires at least one accepted source', new.verification_status;
  end if;
  if new.verification_status = 'self_verified' and not has_self_accepted then
    raise exception 'self_verified requires an accepted self source';
  end if;
  if new.verification_status = 'family_verified' and not has_family_accepted then
    raise exception 'family_verified requires an accepted family source';
  end if;

  return new;
end;
$$;

drop trigger if exists people_verification_evidence_guard on public.people;
create trigger people_verification_evidence_guard
before update of verification_status on public.people
for each row execute procedure public.people_validate_verification_change();

create or replace function public.people_log_verification_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  evidence_id uuid;
begin
  if new.verification_status is not distinct from old.verification_status then
    return new;
  end if;

  select s.id into evidence_id
  from public.people_sources s
  where s.person_id = new.id
    and s.review_status = 'accepted'
    and (
      new.verification_status not in ('self_verified','family_verified')
      or (new.verification_status = 'self_verified' and s.source_type = 'self')
      or (new.verification_status = 'family_verified' and s.source_type = 'family')
    )
  order by s.created_at desc
  limit 1;

  insert into public.people_verification_events(
    person_id, from_status, to_status, evidence_source_id, reviewer_user_id
  ) values (
    new.id, old.verification_status, new.verification_status, evidence_id, auth.uid()
  );

  return new;
end;
$$;

drop trigger if exists people_verification_audit_log on public.people;
create trigger people_verification_audit_log
after update of verification_status on public.people
for each row execute procedure public.people_log_verification_change();

commit;
