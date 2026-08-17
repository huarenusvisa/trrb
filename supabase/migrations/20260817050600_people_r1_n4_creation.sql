begin;

create table if not exists public.people_creation_submissions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  submitted_by_user_id uuid references public.profiles(id) on delete set null,
  creator_type text not null check (creator_type in ('self','family_friend','netizen','editorial')),
  creator_relationship_label text not null default '',
  submission_status text not null default 'submitted' check (submission_status in ('submitted','under_review','accepted','rejected','withdrawn')),
  submitter_note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.people_creation_submissions enable row level security;

create or replace function public.submit_person_record(
  p_primary_name text,
  p_creator_type text,
  p_creator_relationship_label text default '',
  p_summary text default '',
  p_biography text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_person uuid;
  v_name text := btrim(coalesce(p_primary_name, ''));
  v_creator text := btrim(coalesce(p_creator_type, ''));
begin
  if v_user is null then
    raise exception 'authentication required';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 160 then
    raise exception 'invalid primary name';
  end if;
  if v_creator not in ('self','family_friend','netizen','editorial') then
    raise exception 'invalid creator type';
  end if;
  if v_creator = 'editorial' and not exists (
    select 1 from public.profiles p where p.id = v_user and p.role in ('editor','admin')
  ) then
    raise exception 'editorial creation requires editor role';
  end if;

  insert into public.people(
    primary_name, primary_name_normalized, summary, biography,
    creator_user_id, creator_type, creator_relationship_label,
    verification_status, publication_status
  ) values (
    v_name, lower(v_name), left(coalesce(p_summary,''), 2000), left(coalesce(p_biography,''), 30000),
    v_user, v_creator, left(btrim(coalesce(p_creator_relationship_label,'')), 120),
    'unverified', 'review'
  ) returning id into v_person;

  insert into public.people_creation_submissions(
    person_id, submitted_by_user_id, creator_type, creator_relationship_label
  ) values (
    v_person, v_user, v_creator, left(btrim(coalesce(p_creator_relationship_label,'')), 120)
  );

  return v_person;
end;
$$;

revoke all on function public.submit_person_record(text,text,text,text,text) from public;
grant execute on function public.submit_person_record(text,text,text,text,text) to authenticated;

-- A submitter may inspect only their own submission metadata. Publication and verification
-- remain separate moderation decisions; creation never grants verified status.
drop policy if exists people_creation_submission_owner_read on public.people_creation_submissions;
create policy people_creation_submission_owner_read
on public.people_creation_submissions for select
to authenticated
using (submitted_by_user_id = auth.uid());

commit;
