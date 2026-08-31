begin;

-- The repository already contained a first-pass job messaging migration, but
-- production never received the three tables. This idempotent closure creates
-- the canonical listing-bound inbox and tightens column/RLS permissions.
create table if not exists public.job_conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.job_listings(id) on delete restrict,
  employer_user_id uuid not null references public.profiles(id) on delete restrict,
  seeker_user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'open' check (status in ('open','closed','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  unique(listing_id, employer_user_id, seeker_user_id),
  check (employer_user_id <> seeker_user_id)
);

create table if not exists public.job_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.job_conversations(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.job_contact_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.job_listings(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  employer_user_id uuid not null references public.profiles(id) on delete restrict,
  method text not null check (method in ('platform','phone','sms','email')),
  conversation_id uuid references public.job_conversations(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists job_conversations_employer_updated_idx
  on public.job_conversations(employer_user_id, updated_at desc);
create index if not exists job_conversations_seeker_updated_idx
  on public.job_conversations(seeker_user_id, updated_at desc);
create index if not exists job_messages_conversation_created_idx
  on public.job_messages(conversation_id, created_at);
create index if not exists job_messages_unread_idx
  on public.job_messages(conversation_id, read_at, created_at desc);
create index if not exists job_contact_events_listing_created_idx
  on public.job_contact_events(listing_id, created_at desc);

alter table public.job_conversations enable row level security;
alter table public.job_messages enable row level security;
alter table public.job_contact_events enable row level security;

drop policy if exists "job conversations participants admin read" on public.job_conversations;
create policy "job conversations participants admin read"
on public.job_conversations for select to authenticated
using (
  (select auth.uid()) in (employer_user_id, seeker_user_id)
  or public.is_jobs_admin()
);

drop policy if exists "job conversations seeker create" on public.job_conversations;
create policy "job conversations seeker create"
on public.job_conversations for insert to authenticated
with check (
  (select auth.uid()) = seeker_user_id
  and seeker_user_id <> employer_user_id
  and exists (
    select 1 from public.job_listings listing
    where listing.id = listing_id
      and listing.employer_user_id = employer_user_id
      and listing.status = 'open'
      and listing.moderation_hold = false
  )
);

drop policy if exists "job conversations participants admin update" on public.job_conversations;
create policy "job conversations participants admin update"
on public.job_conversations for update to authenticated
using (
  (select auth.uid()) in (employer_user_id, seeker_user_id)
  or public.is_jobs_admin()
)
with check (
  (select auth.uid()) in (employer_user_id, seeker_user_id)
  or public.is_jobs_admin()
);

drop policy if exists "job messages participants admin read" on public.job_messages;
create policy "job messages participants admin read"
on public.job_messages for select to authenticated
using (
  exists (
    select 1 from public.job_conversations conversation
    where conversation.id = conversation_id
      and (
        (select auth.uid()) in (conversation.employer_user_id, conversation.seeker_user_id)
        or public.is_jobs_admin()
      )
  )
);

drop policy if exists "job messages participant create" on public.job_messages;
create policy "job messages participant create"
on public.job_messages for insert to authenticated
with check (
  (select auth.uid()) = sender_user_id
  and exists (
    select 1 from public.job_conversations conversation
    where conversation.id = conversation_id
      and conversation.status = 'open'
      and (select auth.uid()) in (conversation.employer_user_id, conversation.seeker_user_id)
  )
);

drop policy if exists "job messages participants mark read" on public.job_messages;
create policy "job messages participants mark read"
on public.job_messages for update to authenticated
using (
  sender_user_id <> (select auth.uid())
  and exists (
    select 1 from public.job_conversations conversation
    where conversation.id = conversation_id
      and (select auth.uid()) in (conversation.employer_user_id, conversation.seeker_user_id)
  )
)
with check (
  sender_user_id <> (select auth.uid())
  and exists (
    select 1 from public.job_conversations conversation
    where conversation.id = conversation_id
      and (select auth.uid()) in (conversation.employer_user_id, conversation.seeker_user_id)
  )
);

drop policy if exists "job contact events participant admin read" on public.job_contact_events;
create policy "job contact events participant admin read"
on public.job_contact_events for select to authenticated
using (
  (select auth.uid()) in (actor_user_id, employer_user_id)
  or public.is_jobs_admin()
);

drop policy if exists "job contact events actor create" on public.job_contact_events;
create policy "job contact events actor create"
on public.job_contact_events for insert to authenticated
with check (
  (select auth.uid()) = actor_user_id
  and actor_user_id <> employer_user_id
  and exists (
    select 1 from public.job_listings listing
    where listing.id = listing_id
      and listing.employer_user_id = employer_user_id
      and listing.status in ('open','filled')
  )
);

revoke all on public.job_conversations from anon, authenticated;
revoke all on public.job_messages from anon, authenticated;
revoke all on public.job_contact_events from anon, authenticated;
grant select, insert on public.job_conversations to authenticated;
grant update(status) on public.job_conversations to authenticated;
grant select, insert on public.job_messages to authenticated;
grant update(read_at) on public.job_messages to authenticated;
grant select, insert on public.job_contact_events to authenticated;
grant select, insert, update on public.job_conversations to service_role;
grant select, insert, update on public.job_messages to service_role;
grant select, insert on public.job_contact_events to service_role;

create or replace function public.jobs_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.job_conversations
  set updated_at = now(), last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists jobs_touch_conversation_after_message on public.job_messages;
create trigger jobs_touch_conversation_after_message
after insert on public.job_messages
for each row execute function public.jobs_touch_conversation();

create or replace function public.jobs_stamp_conversation_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_stamp_conversation_update on public.job_conversations;
create trigger jobs_stamp_conversation_update
before update of status on public.job_conversations
for each row execute function public.jobs_stamp_conversation_update();

revoke all on function public.jobs_touch_conversation() from public, anon, authenticated;
revoke all on function public.jobs_stamp_conversation_update() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_messages'
  ) then
    alter publication supabase_realtime add table public.job_messages;
  end if;
end $$;

comment on table public.job_conversations is
  'Listing-bound private inbox. Only the employer, the contacting user and authorized jobs admins may read a conversation.';
comment on table public.job_messages is
  'Immutable user-to-user job messages. Authenticated recipients may update read_at only.';

commit;
