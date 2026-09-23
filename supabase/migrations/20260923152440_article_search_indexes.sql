-- Keep small indexes independently deployable; ordered pagination avoids scanning every body.
create extension if not exists pg_trgm with schema extensions;
create index if not exists articles_search_title_summary_trgm_idx on public.articles
using gin (title extensions.gin_trgm_ops, summary extensions.gin_trgm_ops);
create index if not exists articles_public_search_order_idx on public.articles
(published_at desc nulls last, created_at desc, id desc)
where status = 'published' and visibility = 'public';
create index if not exists articles_admin_recent_idx on public.articles (published_at desc nulls last, created_at desc, id desc);
analyze public.articles;
