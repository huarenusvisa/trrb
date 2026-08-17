begin;

create table if not exists public.job_conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.job_listings(id) on delete restrict,
  employer_user_id uuid not null references public.profiles(id) on delete restrict,
  seeker_user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'open' check (status in ('open','closed','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(listing_id, employer_user_id, seeker_user_id)
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

create index if not exists job_conversations_participants_idx on public.job_conversations(employer_user_id,seeker_user_id,updated_at desc);
create index if not exists job_messages_conversation_idx on public.job_messages(conversation_id,created_at);
create index if not exists job_contact_events_listing_idx on public.job_contact_events(listing_id,created_at desc);
create index if not exists job_contact_events_actor_idx on public.job_contact_events(actor_user_id,created_at desc);

alter table public.job_conversations enable row level security;
alter table public.job_messages enable row level security;
alter table public.job_contact_events enable row level security;

create policy "job conversations participants admin read" on public.job_conversations for select using (
  auth.uid() in (employer_user_id,seeker_user_id) or public.is_jobs_admin()
);
create policy "job conversations seeker create" on public.job_conversations for insert with check (
  auth.uid()=seeker_user_id and exists (
    select 1 from public.job_listings l where l.id=listing_id and l.employer_user_id=employer_user_id and l.status='open'
  )
);
create policy "job conversations participants admin update" on public.job_conversations for update using (
  auth.uid() in (employer_user_id,seeker_user_id) or public.is_jobs_admin()
) with check (auth.uid() in (employer_user_id,seeker_user_id) or public.is_jobs_admin());

create policy "job messages participants admin read" on public.job_messages for select using (
  exists (select 1 from public.job_conversations c where c.id=conversation_id and (auth.uid() in (c.employer_user_id,c.seeker_user_id) or public.is_jobs_admin()))
);
create policy "job messages participant create" on public.job_messages for insert with check (
  auth.uid()=sender_user_id and exists (select 1 from public.job_conversations c where c.id=conversation_id and c.status='open' and auth.uid() in (c.employer_user_id,c.seeker_user_id))
);
create policy "job messages participants mark read" on public.job_messages for update using (
  exists (select 1 from public.job_conversations c where c.id=conversation_id and auth.uid() in (c.employer_user_id,c.seeker_user_id))
) with check (exists (select 1 from public.job_conversations c where c.id=conversation_id and auth.uid() in (c.employer_user_id,c.seeker_user_id)));

create policy "job contact events participant admin read" on public.job_contact_events for select using (
  auth.uid() in (actor_user_id,employer_user_id) or public.is_jobs_admin()
);
create policy "job contact events actor create" on public.job_contact_events for insert with check (
  auth.uid()=actor_user_id and exists (select 1 from public.job_listings l where l.id=listing_id and l.employer_user_id=employer_user_id and l.status in ('open','filled'))
);

comment on table public.job_conversations is 'JOBS-R1 N7 canonical Web/APP conversation bound to one formal job listing and unified accounts.';
comment on table public.job_contact_events is 'Auditable real-contact event used by N8 review eligibility; external contact methods record the event without exposing private contact values.';

commit;
