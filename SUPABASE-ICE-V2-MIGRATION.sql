-- 唐人日报 ICE v2 数据库迁移
-- 可重复运行；不删除历史数据；不开放匿名访问。

create extension if not exists pgcrypto;

alter table public.articles
  add column if not exists topic_key text,
  add column if not exists source_platform text,
  add column if not exists source_post_id text,
  add column if not exists source_url text,
  add column if not exists source_account text,
  add column if not exists source_created_at timestamptz,
  add column if not exists ai_confidence smallint,
  add column if not exists review_status text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists articles_source_platform_post_unique
  on public.articles (source_platform, source_post_id)
  where source_platform is not null and source_post_id is not null;

create table if not exists public.ice_query_state (
  query_key text primary key,
  query_text text not null,
  last_seen_id text,
  bootstrap_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_result jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.ice_posts (
  id uuid primary key default gen_random_uuid(),
  x_post_id text not null unique,
  x_url text not null,
  source_registry_id uuid,
  source_username text not null default '',
  source_display_name text not null default '',
  source_type text not null default 'official',
  trust_tier smallint not null default 2,
  independence_key text not null default '',
  source_created_at timestamptz,
  source_text text not null default '',
  media jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  relevant boolean,
  event_fingerprint text,
  event_type text,
  event_date text,
  city text,
  state_code text,
  location_text text,
  processing_status text not null default 'collected',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ice_posts
  add column if not exists source_registry_id uuid,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb,
  add column if not exists event_fingerprint text,
  add column if not exists processing_status text not null default 'collected',
  add column if not exists last_error text;

create table if not exists public.ice_stories (
  id uuid primary key default gen_random_uuid(),
  event_fingerprint text not null unique,
  event_type text not null default 'other',
  title text,
  summary text,
  content text,
  cover_image text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  independent_source_count integer not null default 0,
  official_source_count integer not null default 0,
  media_source_count integer not null default 0,
  organization_source_count integer not null default 0,
  individual_source_count integer not null default 0,
  total_score smallint not null default 0,
  ai_confidence smallint,
  conflict_detected boolean not null default false,
  legal_risk boolean not null default false,
  privacy_risk boolean not null default false,
  fabrication_risk boolean not null default false,
  ai_payload jsonb not null default '{}'::jsonb,
  decision_reason text,
  status text not null default 'collecting',
  human_review_status text not null default 'not_reviewed',
  scheduled_at timestamptz,
  article_id text,
  published_at timestamptz,
  reviewed_by uuid,
  reviewer_email text,
  reviewed_at timestamptz,
  editor_notes text not null default '',
  original_ai_title text,
  original_ai_summary text,
  original_ai_content text,
  final_title text,
  final_summary text,
  final_content text,
  final_cover_image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ice_stories
  add column if not exists ai_payload jsonb not null default '{}'::jsonb,
  add column if not exists human_review_status text not null default 'not_reviewed',
  add column if not exists reviewed_by uuid,
  add column if not exists reviewer_email text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists editor_notes text not null default '',
  add column if not exists final_title text,
  add column if not exists final_summary text,
  add column if not exists final_content text,
  add column if not exists final_cover_image text;

create table if not exists public.ice_story_evidence (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.ice_stories(id) on delete cascade,
  post_id uuid not null references public.ice_posts(id) on delete cascade,
  source_registry_id uuid,
  independence_key text not null,
  source_type text not null,
  trust_tier smallint not null default 2,
  x_post_id text not null default '',
  x_url text not null default '',
  created_at timestamptz not null default now(),
  unique (story_id, post_id)
);

create table if not exists public.ice_review_logs (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.ice_stories(id) on delete cascade,
  reviewer_user_id uuid,
  reviewer_email text not null default '',
  action text not null,
  from_status text,
  to_status text,
  notes text not null default '',
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ice_posts_processing on public.ice_posts (processing_status, created_at);
create index if not exists ice_posts_event_fingerprint on public.ice_posts (event_fingerprint, source_created_at desc);
create index if not exists ice_stories_status_updated on public.ice_stories (status, updated_at desc);
create index if not exists ice_story_evidence_story on public.ice_story_evidence (story_id, independence_key);
create index if not exists ice_review_logs_story on public.ice_review_logs (story_id, created_at desc);

alter table public.ice_query_state enable row level security;
alter table public.ice_posts enable row level security;
alter table public.ice_stories enable row level security;
alter table public.ice_story_evidence enable row level security;
alter table public.ice_review_logs enable row level security;

revoke all on table public.ice_query_state from anon, authenticated;
revoke all on table public.ice_posts from anon, authenticated;
revoke all on table public.ice_stories from anon, authenticated;
revoke all on table public.ice_story_evidence from anon, authenticated;
revoke all on table public.ice_review_logs from anon, authenticated;

grant all on table public.ice_query_state to service_role;
grant all on table public.ice_posts to service_role;
grant all on table public.ice_stories to service_role;
grant all on table public.ice_story_evidence to service_role;
grant all on table public.ice_review_logs to service_role;
