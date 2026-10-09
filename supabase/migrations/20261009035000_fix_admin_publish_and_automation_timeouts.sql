-- The duplicate-title trigger normalizes every published title. Without an
-- expression index each manual/automatic publish scans the whole article table.
create index if not exists articles_published_normalized_title_idx
  on public.articles (public.trrb_normalized_news_title(title))
  where status = 'published';

-- Scheduled knowledge jobs and recent publication checks filter by status and
-- publication time without requiring visibility.
create index if not exists articles_published_recent_lookup_idx
  on public.articles (published_at desc nulls last, id desc)
  include (title, category_name)
  where status = 'published';

-- The public category page was the largest live source of statement timeouts:
-- it filters active public rows by category before ordering by publication.
create index if not exists articles_public_category_published_idx
  on public.articles (category_id, published_at desc, id)
  where status = 'published' and visibility = 'public'
    and hidden_at is null and archived_at is null;
create index if not exists articles_public_category_name_published_idx
  on public.articles (category_name, published_at desc nulls last, created_at desc, id desc)
  where status = 'published' and visibility = 'public';

create index if not exists articles_automation_source_published_idx
  on public.articles (automation_source, published_at desc nulls last, created_at desc)
  where status = 'published';

-- Short-report repair reads the latest published ICE stories.
create index if not exists ice_stories_published_recent_idx
  on public.ice_stories (published_at desc, id desc)
  where status = 'published';

create index if not exists news_candidates_china_hot_recent_idx
  on public.news_candidates (collected_at desc, id desc)
  where pipeline like 'china-hot-li-teacher-v%';

-- Admin authorization runs after login and on every protected API request.
create index if not exists admin_users_active_user_lookup_idx
  on public.admin_users (user_id)
  where is_active = true;
create index if not exists admin_users_active_email_lookup_idx
  on public.admin_users (lower(email))
  where is_active = true;

-- Both the authenticated article manager and public search support body-only
-- matches. This makes their existing bounded ILIKE search use an index instead
-- of repeatedly scanning and detoasting every article body.
create extension if not exists pg_trgm with schema extensions;
create index if not exists articles_search_content_trgm_idx on public.articles
  using gin (content extensions.gin_trgm_ops);

analyze public.articles;
analyze public.ice_stories;
analyze public.admin_users;
analyze public.news_candidates;
