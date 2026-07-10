-- 唐人日报“我要曝光”功能数据库与存储初始化
-- 在 Supabase Dashboard -> SQL Editor 中整段运行一次。

create extension if not exists pgcrypto;

create table if not exists public.exposure_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 4 and 160),
  body text not null check (char_length(body) between 10 and 20000),
  target_name text,
  location text,
  happened_at date,
  author_name text,
  author_contact text,
  anonymous boolean not null default true,
  disclaimer_accepted boolean not null default false,
  status text not null default 'published' check (status in ('published','disputed','resolved','hidden','removed')),
  pinned boolean not null default false,
  view_count bigint not null default 0,
  created_at timestamptz not null default now(),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exposure_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.exposure_posts(id) on delete cascade,
  media_url text not null,
  storage_path text,
  media_type text not null check (media_type in ('image','video')),
  file_name text,
  mime_type text,
  size_bytes bigint,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.exposure_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.exposure_posts(id) on delete cascade,
  parent_id uuid references public.exposure_comments(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 40),
  email text,
  body text not null check (char_length(body) between 1 and 2000),
  role text not null default 'reader' check (role in ('reader','author','subject','admin')),
  status text not null default 'published' check (status in ('published','hidden','removed')),
  likes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exposure_posts_public_idx on public.exposure_posts(status, pinned desc, published_at desc);
create index if not exists exposure_media_post_idx on public.exposure_media(post_id, sort_order);
create index if not exists exposure_comments_post_idx on public.exposure_comments(post_id, created_at);

alter table public.exposure_posts enable row level security;
alter table public.exposure_media enable row level security;
alter table public.exposure_comments enable row level security;

-- 公开读写通过 Netlify Functions 完成，敏感联系方式不会直接暴露给浏览器。
-- 管理员可在 Supabase 登录后通过后台管理。
drop policy if exists exposure_posts_admin_all on public.exposure_posts;
create policy exposure_posts_admin_all on public.exposure_posts
for all to authenticated
using (exists (
  select 1 from public.admin_users au
  where au.user_id = auth.uid() and au.is_active = true and lower(au.role) in ('owner','admin')
))
with check (exists (
  select 1 from public.admin_users au
  where au.user_id = auth.uid() and au.is_active = true and lower(au.role) in ('owner','admin')
));

drop policy if exists exposure_media_admin_all on public.exposure_media;
create policy exposure_media_admin_all on public.exposure_media
for all to authenticated
using (exists (
  select 1 from public.admin_users au
  where au.user_id = auth.uid() and au.is_active = true and lower(au.role) in ('owner','admin')
))
with check (exists (
  select 1 from public.admin_users au
  where au.user_id = auth.uid() and au.is_active = true and lower(au.role) in ('owner','admin')
));

drop policy if exists exposure_comments_admin_all on public.exposure_comments;
create policy exposure_comments_admin_all on public.exposure_comments
for all to authenticated
using (exists (
  select 1 from public.admin_users au
  where au.user_id = auth.uid() and au.is_active = true and lower(au.role) in ('owner','admin')
))
with check (exists (
  select 1 from public.admin_users au
  where au.user_id = auth.uid() and au.is_active = true and lower(au.role) in ('owner','admin')
));

-- 媒体存储桶：图片、视频由浏览器直接上传，避免 Netlify Functions 的请求体限制。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exposure-media',
  'exposure-media',
  true,
  209715200,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists exposure_media_public_read on storage.objects;
create policy exposure_media_public_read on storage.objects
for select to public
using (bucket_id = 'exposure-media');

drop policy if exists exposure_media_public_upload on storage.objects;
create policy exposure_media_public_upload on storage.objects
for insert to anon, authenticated
with check (
  bucket_id = 'exposure-media'
  and (storage.foldername(name))[1] = 'pending'
);

drop policy if exists exposure_media_admin_manage on storage.objects;
create policy exposure_media_admin_manage on storage.objects
for all to authenticated
using (
  bucket_id = 'exposure-media'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true and lower(au.role) in ('owner','admin')
  )
)
with check (
  bucket_id = 'exposure-media'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active = true and lower(au.role) in ('owner','admin')
  )
);
