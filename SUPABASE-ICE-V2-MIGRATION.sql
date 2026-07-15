-- 唐人日报 ICE v2 数据库迁移
-- 可重复运行；不删除历史数据；不开放匿名访问。

create table if not exists public.ice_query_state (
  query_key text primary key,
  query_text text,
  since_id text,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_result jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.ice_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'x',
  platform_post_id text,
  source_key text,
  source_handle text,
  source_class text,
  source_url text,
  source_created_at timestamptz,
  text text,
  media jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  relevant boolean not null default true,
  processing_status text not null default 'collected',
  event_fingerprint text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ice_posts_platform_post_unique
  on public.ice_posts(platform, platform_post_id)
  where platform_post_id is not null;
create index if not exists ice_posts_processing_idx on public.ice_posts(processing_status, created_at desc);
create index if not exists ice_posts_event_idx on public.ice_posts(event_fingerprint);

create table if not exists public.ice_stories (
  id uuid primary key default gen_random_uuid(),
  event_fingerprint text not null unique,
  status text not null default 'pending_corroboration',
  human_review_status text not null default 'pending',
  title text,
  summary text,
  content text,
  cover_image text,
  source_preview text,
  source_created_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  independent_source_count integer not null default 0,
  official_source_count integer not null default 0,
  newsroom_source_count integer not null default 0,
  duplicate_count integer not null default 0,
  conflict_detected boolean not null default false,
  legal_risk boolean not null default false,
  privacy_risk boolean not null default false,
  fabrication_risk boolean not null default false,
  ai_payload jsonb not null default '{}'::jsonb,
  decision_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  published_article_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ice_stories_status_idx on public.ice_stories(status, updated_at desc);
create index if not exists ice_stories_review_idx on public.ice_stories(human_review_status, updated_at desc);

create table if not exists public.ice_story_evidence (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.ice_stories(id) on delete cascade,
  post_id uuid references public.ice_posts(id) on delete set null,
  source_key text,
  source_handle text,
  source_class text,
  source_url text,
  source_created_at timestamptz,
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(story_id, post_id)
);
create index if not exists ice_story_evidence_story_idx on public.ice_story_evidence(story_id, created_at);

create table if not exists public.ice_review_logs (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.ice_stories(id) on delete set null,
  action text not null,
  admin_user_id text,
  admin_email text,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ice_review_logs_story_idx on public.ice_review_logs(story_id, created_at desc);

alter table public.articles add column if not exists source_post_id text;
alter table public.articles add column if not exists event_fingerprint text;
alter table public.articles add column if not exists source_evidence jsonb not null default '[]'::jsonb;
create unique index if not exists articles_event_fingerprint_unique
  on public.articles(event_fingerprint)
  where event_fingerprint is not null;

alter table public.ice_query_state enable row level security;
alter table public.ice_posts enable row level security;
alter table public.ice_stories enable row level security;
alter table public.ice_story_evidence enable row level security;
alter table public.ice_review_logs enable row level security;

do $$ begin
  create policy ice_query_state_service_all on public.ice_query_state for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ice_posts_service_all on public.ice_posts for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ice_stories_service_all on public.ice_stories for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ice_story_evidence_service_all on public.ice_story_evidence for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy ice_review_logs_service_all on public.ice_review_logs for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
