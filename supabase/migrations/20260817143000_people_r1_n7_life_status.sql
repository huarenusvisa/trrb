begin;

create table if not exists public.people_life_status_events (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  from_status text not null check (from_status in ('living','deceased','unknown')),
  to_status text not null check (to_status in ('living','deceased','unknown')),
  evidence_source_id uuid references public.people_sources(id) on delete set null,
  reviewer_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_status <> to_status)
);
create index if not exists people_life_status_events_person_idx
  on public.people_life_status_events(person_id, created_at desc);

alter table public.people_life_status_events enable row level security;

create or replace function public.people_validate_life_status_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  has_death_evidence boolean;
begin
  select exists(
    select 1 from public.people_sources s
    where s.person_id = old.id
      and s.review_status = 'accepted'
      and 'death' = any(s.fact_scope)
  ) into has_death_evidence;

  if new.life_status = 'deceased' and not has_death_evidence then
    raise exception 'deceased status requires an accepted source scoped to death';
  end if;

  if new.death_date is not null then
    if new.life_status <> 'deceased' then
      raise exception 'death_date requires life_status=deceased';
    end if;
    if not has_death_evidence then
      raise exception 'death_date requires an accepted source scoped to death';
    end if;
  end if;

  if new.life_status in ('living','unknown') and new.death_date is not null then
    raise exception 'living/unknown records cannot carry a death_date';
  end if;

  return new;
end;
$$;

drop trigger if exists people_life_status_evidence_guard on public.people;
create trigger people_life_status_evidence_guard
before update of life_status, death_date, death_date_precision on public.people
for each row execute procedure public.people_validate_life_status_change();

create or replace function public.people_log_life_status_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  evidence_id uuid;
begin
  if new.life_status is not distinct from old.life_status then
    return new;
  end if;

  select s.id into evidence_id
  from public.people_sources s
  where s.person_id = new.id
    and s.review_status = 'accepted'
    and 'death' = any(s.fact_scope)
  order by s.created_at desc
  limit 1;

  insert into public.people_life_status_events(
    person_id, from_status, to_status, evidence_source_id, reviewer_user_id
  ) values (
    new.id, old.life_status, new.life_status, evidence_id, auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists people_life_status_audit_log on public.people;
create trigger people_life_status_audit_log
after update of life_status on public.people
for each row execute procedure public.people_log_life_status_change();

commit;
