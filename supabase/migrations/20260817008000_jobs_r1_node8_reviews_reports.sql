begin;

create table if not exists public.job_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.job_listings(id) on delete restrict,
  reviewer_user_id uuid not null references public.profiles(id) on delete restrict,
  employer_user_id uuid not null references public.profiles(id) on delete restrict,
  contact_event_id uuid not null references public.job_contact_events(id) on delete restrict,
  communication_score smallint not null check (communication_score between 1 and 5),
  accuracy_score smallint not null check (accuracy_score between 1 and 5),
  compensation_score smallint check (compensation_score between 1 and 5),
  body text check (body is null or char_length(body) <= 2000),
  public_anonymous boolean not null default false,
  status text not null default 'published' check (status in ('published','under_review','hidden','removed')),
  employer_reply text check (employer_reply is null or char_length(employer_reply) <= 2000),
  employer_replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(listing_id, reviewer_user_id)
);

create table if not exists public.job_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.job_listings(id) on delete restrict,
  review_id uuid references public.job_reviews(id) on delete restrict,
  reporter_user_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (reason in ('suspected_fraud','misleading_content','compensation_mismatch','harassment','privacy','copyright','other')),
  details text check (details is null or char_length(details) <= 3000),
  status text not null default 'open' check (status in ('open','triaged','actioned','dismissed')),
  assigned_admin_user_id uuid references public.profiles(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (listing_id is not null or review_id is not null)
);

create table if not exists public.job_risk_labels (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.job_listings(id) on delete restrict,
  label text not null check (label in ('identity_inconsistent','compensation_inconsistent','content_inconsistent','contact_risk','suspected_fraud','other')),
  source text not null default 'admin' check (source in ('admin','report','system')),
  status text not null default 'active' check (status in ('active','resolved','dismissed')),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_reviews_listing_idx on public.job_reviews(listing_id,status,created_at desc);
create index if not exists job_reports_status_idx on public.job_reports(status,created_at desc);
create index if not exists job_risk_labels_listing_idx on public.job_risk_labels(listing_id,status,created_at desc);

alter table public.job_reviews enable row level security;
alter table public.job_reports enable row level security;
alter table public.job_risk_labels enable row level security;

create policy "job reviews public admin read" on public.job_reviews for select using (
  status='published' or auth.uid() in (reviewer_user_id,employer_user_id) or public.is_jobs_admin()
);
create policy "job reviews contacted seeker create" on public.job_reviews for insert with check (
  auth.uid()=reviewer_user_id
  and exists (
    select 1 from public.job_contact_events e
    where e.id=contact_event_id and e.listing_id=listing_id and e.actor_user_id=reviewer_user_id and e.employer_user_id=employer_user_id
  )
);
create policy "job reviews reviewer edit" on public.job_reviews for update using (
  auth.uid()=reviewer_user_id or auth.uid()=employer_user_id or public.is_jobs_admin()
) with check (
  auth.uid()=reviewer_user_id or auth.uid()=employer_user_id or public.is_jobs_admin()
);

create policy "job reports reporter admin read" on public.job_reports for select using (
  auth.uid()=reporter_user_id or public.is_jobs_admin()
);
create policy "job reports signed user create" on public.job_reports for insert with check (auth.uid()=reporter_user_id);
create policy "job reports admin govern" on public.job_reports for update using (public.is_jobs_admin()) with check (public.is_jobs_admin());

create policy "job risk labels public admin read" on public.job_risk_labels for select using (status='active' or public.is_jobs_admin());
create policy "job risk labels admin manage" on public.job_risk_labels for all using (public.is_jobs_admin()) with check (public.is_jobs_admin());

comment on table public.job_reviews is 'JOBS-R1 N8 reviews require a canonical job_contact_events record; public anonymity hides reviewer identity from public UI but platform account remains traceable.';
comment on table public.job_reports is 'JOBS-R1 N8 anti-fraud and abuse reports retained independently from listing/review public lifecycle.';
comment on table public.job_risk_labels is 'JOBS-R1 N8 auditable risk labels governed from the unified /admin surface.';

commit;
