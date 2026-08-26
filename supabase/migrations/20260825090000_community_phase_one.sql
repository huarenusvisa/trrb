begin;

create extension if not exists pgcrypto;

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in (
    'hot_discussion','immigration_help','court_experience','uscis_interview',
    'ice_experience','lawyer_review','tipoff'
  )),
  title text not null check (char_length(title) between 4 and 120),
  content text not null check (char_length(content) between 20 and 12000),
  content_label text not null default 'personal_experience'
    check (content_label in ('official_policy','personal_experience','community_summary','question')),
  location_state text check (location_state is null or char_length(location_state) <= 40),
  location_city text check (location_city is null or char_length(location_city) <= 120),
  agency_office text check (agency_office is null or char_length(agency_office) <= 180),
  case_type text check (case_type is null or char_length(case_type) <= 100),
  event_date date,
  outcome text check (outcome is null or char_length(outcome) <= 80),
  judge_name text check (judge_name is null or char_length(judge_name) <= 180),
  judge_slug text check (judge_slug is null or char_length(judge_slug) <= 220),
  lawyer_or_firm text check (lawyer_or_firm is null or char_length(lawyer_or_firm) <= 220),
  status text not null default 'pending'
    check (status in ('draft','pending','published','hidden','deleted')),
  moderation_state text not null default 'unreviewed'
    check (moderation_state in ('unreviewed','rules_passed','manual_review','approved','rejected')),
  risk_level text not null default 'low' check (risk_level in ('low','medium','high')),
  risk_flags jsonb not null default '[]'::jsonb check (jsonb_typeof(risk_flags) = 'array'),
  is_indexable boolean not null default false,
  like_count integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_public_feed_idx
  on public.community_posts(status, created_at desc);
create index if not exists community_posts_category_feed_idx
  on public.community_posts(category, status, created_at desc);
create index if not exists community_posts_uscis_analytics_idx
  on public.community_posts(category, location_state, agency_office, case_type, outcome)
  where status='published' and category='uscis_interview';
create index if not exists community_posts_user_idx
  on public.community_posts(user_id, created_at desc);

create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.community_post_comments(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 3000),
  status text not null default 'pending'
    check (status in ('pending','published','hidden','deleted')),
  risk_level text not null default 'low' check (risk_level in ('low','medium','high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_post_comments_feed_idx
  on public.community_post_comments(post_id, status, created_at asc);
create index if not exists community_post_comments_user_idx
  on public.community_post_comments(user_id, created_at desc);

create table if not exists public.community_post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(post_id,user_id)
);

create table if not exists public.community_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 2 and 500),
  status text not null default 'open'
    check (status in ('open','reviewed','dismissed','actioned')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(post_id,reporter_user_id)
);

create table if not exists public.community_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.community_posts(id) on delete set null,
  comment_id uuid references public.community_post_comments(id) on delete set null,
  action text not null check (char_length(action) between 2 and 120),
  reason text not null default '' check (char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.community_posts enable row level security;
alter table public.community_post_comments enable row level security;
alter table public.community_post_likes enable row level security;
alter table public.community_post_reports enable row level security;
alter table public.community_moderation_actions enable row level security;

drop policy if exists "community posts public read" on public.community_posts;
create policy "community posts public read" on public.community_posts
  for select to anon, authenticated
  using (status='published' or auth.uid()=user_id);

drop policy if exists "community comments public read" on public.community_post_comments;
create policy "community comments public read" on public.community_post_comments
  for select to anon, authenticated
  using (status='published' or auth.uid()=user_id);

drop policy if exists "community likes public read" on public.community_post_likes;
create policy "community likes public read" on public.community_post_likes
  for select to anon, authenticated using (true);

drop policy if exists "community reports owner read" on public.community_post_reports;
create policy "community reports owner read" on public.community_post_reports
  for select to authenticated using (auth.uid()=reporter_user_id);

revoke all on public.community_posts from anon, authenticated;
revoke all on public.community_post_comments from anon, authenticated;
revoke all on public.community_post_likes from anon, authenticated;
revoke all on public.community_post_reports from anon, authenticated;
revoke all on public.community_moderation_actions from anon, authenticated;

grant select on public.community_posts to anon, authenticated;
grant select on public.community_post_comments to anon, authenticated;
grant select on public.community_post_likes to anon, authenticated;
grant select on public.community_post_reports to authenticated;
grant select(id,display_name,avatar_key) on public.profiles to anon, authenticated;

comment on table public.community_posts is
  '唐人日报社区主帖；USCIS面谈使用显式地区、办公室、案件类型和结果字段，为未来样本统计保留可审计数据。';
comment on column public.community_posts.is_indexable is
  '仅经人工审核、具备足够原创信息的帖子才可进入搜索引擎索引。';
comment on column public.community_posts.outcome is
  '社区用户自述结果，不等于USCIS官方统计；统计展示必须同时披露样本量。';

commit;
