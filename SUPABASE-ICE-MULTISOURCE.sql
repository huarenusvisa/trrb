-- 唐人日报 ICE 多信源交叉验证系统 v2
-- Supabase Dashboard → SQL Editor → New query
-- 可重复运行，不删除现有数据。

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

create index if not exists articles_ice_topic_published
  on public.articles (topic_key, published_at desc)
  where status = 'published' and topic_key = 'ice';

create table if not exists public.source_registry (
  id uuid primary key default gen_random_uuid(),
  topic_key text not null default 'ice',
  x_username text not null,
  display_name text not null default '',
  source_type text not null,
  trust_tier smallint not null check (trust_tier between 1 and 5),
  independence_key text not null,
  enabled boolean not null default true,
  requires_corroboration boolean not null default true,
  validated boolean not null default false,
  x_user_id text,
  profile jsonb not null default '{}'::jsonb,
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (topic_key, x_username)
);

create index if not exists source_registry_ice_enabled
  on public.source_registry (topic_key, enabled, trust_tier);

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
  source_registry_id uuid references public.source_registry(id) on delete set null,
  source_username text not null default '',
  source_display_name text not null default '',
  source_type text not null default 'discovered_individual',
  trust_tier smallint not null default 5,
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
  people_count integer,
  claims jsonb not null default '[]'::jsonb,
  entities jsonb not null default '[]'::jsonb,
  extraction_confidence smallint check (extraction_confidence between 0 and 100),
  extraction_payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'collected'
    check (processing_status in (
      'collected','processing','extracted','irrelevant',
      'duplicate','failed','clustered'
    )),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ice_posts_processing
  on public.ice_posts (processing_status, created_at);

create index if not exists ice_posts_fingerprint
  on public.ice_posts (event_fingerprint, source_created_at desc);

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
  source_reliability_score smallint not null default 0,
  cross_check_score smallint not null default 0,
  completeness_score smallint not null default 0,
  time_location_score smallint not null default 0,
  public_value_score smallint not null default 0,
  risk_score smallint not null default 0,
  total_score smallint not null default 0,
  conflict_detected boolean not null default false,
  legal_risk boolean not null default false,
  privacy_risk boolean not null default false,
  fabrication_risk boolean not null default false,
  ai_confidence smallint check (ai_confidence between 0 and 100),
  ai_payload jsonb not null default '{}'::jsonb,
  decision_reason text,
  status text not null default 'collecting'
    check (status in (
      'collecting','pending_corroboration','pending_review',
      'approved','published','rejected','failed'
    )),
  scheduled_at timestamptz,
  article_id text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ice_stories_due
  on public.ice_stories (status, scheduled_at)
  where status = 'approved';

create index if not exists ice_stories_score
  on public.ice_stories (total_score desc, last_seen_at desc);

create table if not exists public.ice_story_evidence (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.ice_stories(id) on delete cascade,
  post_id uuid not null references public.ice_posts(id) on delete cascade,
  source_registry_id uuid references public.source_registry(id) on delete set null,
  independence_key text not null,
  source_type text not null,
  trust_tier smallint not null,
  x_post_id text not null,
  x_url text not null,
  created_at timestamptz not null default now(),
  unique (story_id, post_id)
);

create index if not exists ice_story_evidence_story
  on public.ice_story_evidence (story_id, independence_key);

create or replace function public.trrb_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists source_registry_updated_at on public.source_registry;
create trigger source_registry_updated_at
before update on public.source_registry
for each row execute function public.trrb_set_updated_at();

drop trigger if exists ice_posts_updated_at on public.ice_posts;
create trigger ice_posts_updated_at
before update on public.ice_posts
for each row execute function public.trrb_set_updated_at();

drop trigger if exists ice_stories_updated_at on public.ice_stories;
create trigger ice_stories_updated_at
before update on public.ice_stories
for each row execute function public.trrb_set_updated_at();

alter table public.source_registry enable row level security;
alter table public.ice_query_state enable row level security;
alter table public.ice_posts enable row level security;
alter table public.ice_stories enable row level security;
alter table public.ice_story_evidence enable row level security;

revoke all on table public.source_registry from anon, authenticated;
revoke all on table public.ice_query_state from anon, authenticated;
revoke all on table public.ice_posts from anon, authenticated;
revoke all on table public.ice_stories from anon, authenticated;
revoke all on table public.ice_story_evidence from anon, authenticated;

grant all on table public.source_registry to service_role;
grant all on table public.ice_query_state to service_role;
grant all on table public.ice_posts to service_role;
grant all on table public.ice_stories to service_role;
grant all on table public.ice_story_evidence to service_role;


-- v2.1 成本控制账本
create table if not exists public.ice_usage_ledger (
  usage_key text primary key,
  period_type text not null check (period_type in ('day','month')),
  period_label text not null,
  x_requests integer not null default 0,
  x_posts_read integer not null default 0,
  openai_calls integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.ice_usage_ledger enable row level security;
revoke all on table public.ice_usage_ledger from anon, authenticated;
grant all on table public.ice_usage_ledger to service_role;


-- ============================================================
-- v3：trrb.net/admin 人工审核中心
-- 可重复运行，不删除现有内容。
-- ============================================================

alter table public.ice_stories
  add column if not exists human_review_status text not null default 'not_reviewed',
  add column if not exists reviewed_by uuid,
  add column if not exists reviewer_email text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists editor_notes text not null default '',
  add column if not exists original_ai_title text,
  add column if not exists original_ai_summary text,
  add column if not exists original_ai_content text,
  add column if not exists final_title text,
  add column if not exists final_summary text,
  add column if not exists final_content text,
  add column if not exists final_cover_image text;

update public.ice_stories
set
  original_ai_title = coalesce(original_ai_title, title),
  original_ai_summary = coalesce(original_ai_summary, summary),
  original_ai_content = coalesce(original_ai_content, content)
where original_ai_title is null
   or original_ai_summary is null
   or original_ai_content is null;

create or replace function public.trrb_preserve_ice_ai_original()
returns trigger
language plpgsql
as $$
begin
  if new.original_ai_title is null and new.title is not null then
    new.original_ai_title = new.title;
  end if;
  if new.original_ai_summary is null and new.summary is not null then
    new.original_ai_summary = new.summary;
  end if;
  if new.original_ai_content is null and new.content is not null then
    new.original_ai_content = new.content;
  end if;
  return new;
end;
$$;

drop trigger if exists ice_stories_preserve_ai_original on public.ice_stories;
create trigger ice_stories_preserve_ai_original
before insert or update on public.ice_stories
for each row execute function public.trrb_preserve_ice_ai_original();

create table if not exists public.ice_review_logs (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.ice_stories(id) on delete cascade,
  reviewer_user_id uuid,
  reviewer_email text,
  action text not null,
  from_status text,
  to_status text,
  notes text not null default '',
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ice_review_logs_story_time
  on public.ice_review_logs (story_id, created_at desc);

create index if not exists ice_stories_human_review_queue
  on public.ice_stories (human_review_status, updated_at desc);

alter table public.ice_review_logs enable row level security;
revoke all on table public.ice_review_logs from anon, authenticated;
grant all on table public.ice_review_logs to service_role;

-- ICE工作表继续只允许服务端 service_role 访问。
-- 浏览器后台通过 /.netlify/functions/ice-review 验证管理员后操作。
revoke all on table public.ice_stories from anon, authenticated;
revoke all on table public.ice_story_evidence from anon, authenticated;
revoke all on table public.ice_posts from anon, authenticated;
