begin;

create table if not exists public.seo_task_queue (
  task_id text primary key,
  site_key text not null check (site_key in ('asylumjudge', 'huarengongzuo')),
  origin text not null,
  action text not null check (action in ('add', 'update', 'delete')),
  url text not null,
  lastmod timestamptz,
  source_id text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'submitted', 'failed', 'ignored')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  lock_owner text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_key, action, url),
  check (origin in ('https://asylumjudge.com', 'https://huarengongzuo.com')),
  check (url like origin || '/%')
);

create index if not exists seo_task_queue_dispatch_idx
  on public.seo_task_queue (site_key, status, available_at, action, created_at);

alter table public.seo_task_queue enable row level security;
revoke all on table public.seo_task_queue from anon, authenticated;
grant select, insert, update on table public.seo_task_queue to service_role;

comment on table public.seo_task_queue is
  'Server-only intake queue for independent-site SEO manifests. Only the central SEO robot may dispatch tasks externally.';

commit;
