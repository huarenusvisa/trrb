-- 唐人日报 ICE“随手拍”审核系统 v2
-- 在 Supabase Dashboard → SQL Editor 中完整运行一次。
-- 可重复运行，不删除现有数据。

create extension if not exists pgcrypto;

-- 文章表需要这些字段，已有字段不会重复创建。
alter table public.articles
  add column if not exists topic_key text,
  add column if not exists source_platform text,
  add column if not exists source_post_id text,
  add column if not exists source_url text,
  add column if not exists source_account text,
  add column if not exists source_created_at timestamptz,
  add column if not exists review_status text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists articles_source_platform_post_unique
  on public.articles (source_platform, source_post_id)
  where source_platform is not null and source_post_id is not null;

create table if not exists public.ice_user_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date default current_date,
  location_text text,
  event_description text,
  status text default 'draft',
  created_at timestamptz default now()
);

-- 兼容历史版 ice_user_reports：旧表存在时补齐新字段。
alter table public.ice_user_reports
  add column if not exists contact_info text not null default '',
  add column if not exists media jsonb not null default '[]'::jsonb,
  add column if not exists submitter_ip_hash text,
  add column if not exists user_agent text not null default '',
  add column if not exists source_page text not null default '/topic/ice/',
  add column if not exists admin_title text not null default '',
  add column if not exists admin_summary text not null default '',
  add column if not exists admin_content text not null default '',
  add column if not exists selected_cover_path text not null default '',
  add column if not exists cover_image text not null default '',
  add column if not exists article_id text,
  add column if not exists reviewer_user_id uuid,
  add column if not exists reviewer_email text not null default '',
  add column if not exists review_note text not null default '',
  add column if not exists reviewed_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- 历史版可能保留 media_urls/reviewer/review_time 等字段，不删除，避免破坏旧数据。
update public.ice_user_reports
set
  status = case
    when status in ('draft','reviewing','published','rejected') then status
    else 'draft'
  end,
  updated_at = coalesce(updated_at, created_at, now());

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ice_user_reports_status_check'
      and conrelid = 'public.ice_user_reports'::regclass
  ) then
    alter table public.ice_user_reports
      add constraint ice_user_reports_status_check
      check (status in ('draft','reviewing','published','rejected'));
  end if;
end
$$;

create index if not exists ice_user_reports_status_created_idx
  on public.ice_user_reports (status, created_at desc);

create index if not exists ice_user_reports_ip_created_idx
  on public.ice_user_reports (submitter_ip_hash, created_at desc);


create table if not exists public.ice_report_upload_tokens (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  mime_type text not null,
  file_size bigint not null,
  submitter_ip_hash text not null,
  used boolean not null default false,
  report_id uuid references public.ice_user_reports(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '2 hours'),
  created_at timestamptz not null default now()
);

create index if not exists ice_report_upload_tokens_ip_created_idx
  on public.ice_report_upload_tokens (submitter_ip_hash, created_at desc);

create index if not exists ice_report_upload_tokens_expiry_idx
  on public.ice_report_upload_tokens (expires_at)
  where used = false;

create or replace function public.trrb_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ice_user_reports_updated_at on public.ice_user_reports;
create trigger ice_user_reports_updated_at
before update on public.ice_user_reports
for each row execute function public.trrb_set_updated_at();

-- 所有数据库读写必须经过 Netlify Function 的 service_role。
alter table public.ice_user_reports enable row level security;
alter table public.ice_report_upload_tokens enable row level security;
revoke all on table public.ice_user_reports from anon, authenticated;
revoke all on table public.ice_report_upload_tokens from anon, authenticated;
grant all on table public.ice_user_reports to service_role;
grant all on table public.ice_report_upload_tokens to service_role;

-- 私有原始素材：审核前不能公开访问。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ice-report-private',
  'ice-report-private',
  false,
  83886080,
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'video/mp4','video/quicktime','video/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 审核通过后的公开素材。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ice-report-public',
  'ice-report-public',
  true,
  83886080,
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'video/mp4','video/quicktime','video/webm'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 不向 anon/authenticated 开放直接写入；上传使用服务端生成的两小时签名URL。
drop policy if exists "ice report private anon read" on storage.objects;
drop policy if exists "ice report private anon insert" on storage.objects;
drop policy if exists "ice report public anon insert" on storage.objects;
