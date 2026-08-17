begin;

alter table public.job_listings
  add column if not exists last_republished_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists status_reason text,
  add column if not exists moderation_hold boolean not null default false;

alter table public.job_seeker_posts
  add column if not exists last_republished_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists status_reason text,
  add column if not exists moderation_hold boolean not null default false;

create table if not exists public.job_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('listing','seeker_post')),
  entity_id uuid not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  from_status text,
  to_status text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists job_lifecycle_entity_idx
  on public.job_lifecycle_events(entity_type,entity_id,created_at desc);

create or replace function public.jobs_record_listing_lifecycle()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    insert into public.job_lifecycle_events(entity_type,entity_id,actor_user_id,from_status,to_status,reason)
    values ('listing',new.id,auth.uid(),case when tg_op='INSERT' then null else old.status end,new.status,new.status_reason);
    if new.status='open' and (tg_op='INSERT' or old.status is distinct from 'open') then
      new.last_republished_at=now();
      new.published_at=coalesce(new.published_at,now());
    end if;
    if new.status in ('filled','unlisted','deleted') then new.closed_at=coalesce(new.closed_at,now()); end if;
    if new.status='deleted' then new.deleted_at=coalesce(new.deleted_at,now()); end if;
  end if;
  return new;
end;$$;

drop trigger if exists jobs_listing_lifecycle on public.job_listings;
create trigger jobs_listing_lifecycle before insert or update of status on public.job_listings
for each row execute function public.jobs_record_listing_lifecycle();

create or replace function public.jobs_record_seeker_lifecycle()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    insert into public.job_lifecycle_events(entity_type,entity_id,actor_user_id,from_status,to_status,reason)
    values ('seeker_post',new.id,auth.uid(),case when tg_op='INSERT' then null else old.status end,new.status,new.status_reason);
    if new.status='seeking' and (tg_op='INSERT' or old.status is distinct from 'seeking') then
      new.last_republished_at=now();
      new.published_at=coalesce(new.published_at,now());
    end if;
    if new.status in ('found','unlisted','deleted') then new.closed_at=coalesce(new.closed_at,now()); end if;
    if new.status='deleted' then new.deleted_at=coalesce(new.deleted_at,now()); end if;
  end if;
  return new;
end;$$;

drop trigger if exists jobs_seeker_lifecycle on public.job_seeker_posts;
create trigger jobs_seeker_lifecycle before insert or update of status on public.job_seeker_posts
for each row execute function public.jobs_record_seeker_lifecycle();

alter table public.job_lifecycle_events enable row level security;
create policy "jobs lifecycle owner admin read" on public.job_lifecycle_events for select using (
  public.is_jobs_admin() or
  (entity_type='listing' and exists(select 1 from public.job_listings j where j.id=entity_id and j.employer_user_id=auth.uid())) or
  (entity_type='seeker_post' and exists(select 1 from public.job_seeker_posts s where s.id=entity_id and s.seeker_user_id=auth.uid()))
);

-- Current-search views intentionally exclude ended/paused/unlisted/deleted records.
create or replace view public.job_listings_current as
select * from public.job_listings
where status='open' and moderation_hold=false and (expires_at is null or expires_at>now());

create or replace view public.job_seeker_posts_current as
select * from public.job_seeker_posts
where status='seeking' and moderation_hold=false and (expires_at is null or expires_at>now());

comment on table public.job_lifecycle_events is 'JOBS-R1 N9 immutable lifecycle audit. Public record deletion must not erase review/report/risk safety records.';
comment on view public.job_listings_current is 'Current search only. Filled/ended history stays addressable by permanent UUID but never re-enters current search.';
comment on column public.job_listings.moderation_hold is 'Admin governance hold. A held record must not appear in current-search views even if owner status is open.';

commit;
