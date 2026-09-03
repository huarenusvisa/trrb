-- Reviewed article translations for the mobile app and public website.
-- Translation generation and review remain server-side; public clients receive
-- only published rows that still match the current source article revision.

create table if not exists public.article_translations (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  locale text not null check (locale in ('en', 'zh-TW')),
  title text not null check (char_length(title) between 1 and 500),
  summary text check (summary is null or char_length(summary) <= 5000),
  content text not null check (char_length(content) between 1 and 200000),
  source_article_updated_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'rejected')),
  translation_source text not null default 'reviewed_server_cache',
  model text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (article_id, locale),
  constraint article_translations_published_reviewed
    check (status <> 'published' or (reviewed_by is not null and reviewed_at is not null))
);

create index if not exists article_translations_published_lookup_idx
  on public.article_translations (article_id, locale, source_article_updated_at)
  where status = 'published';

alter table public.article_translations enable row level security;

revoke all on table public.article_translations from anon, authenticated;
grant select on table public.article_translations to anon, authenticated;
grant all on table public.article_translations to service_role;

drop policy if exists "Read current reviewed article translations" on public.article_translations;
create policy "Read current reviewed article translations"
  on public.article_translations
  for select
  to anon, authenticated
  using (
    status = 'published'
    and reviewed_by is not null
    and reviewed_at is not null
    and exists (
      select 1
      from public.articles
      where articles.id = article_translations.article_id
        and articles.status = 'published'
        and articles.visibility = 'public'
        and articles.updated_at = article_translations.source_article_updated_at
    )
  );

comment on table public.article_translations is
  'Server-generated, human-reviewed article translations. Public clients can only read current published rows.';
