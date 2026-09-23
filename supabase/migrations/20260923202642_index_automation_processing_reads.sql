-- Processing queues order by recency, independently of score or review state.
CREATE INDEX IF NOT EXISTS ice_stories_last_seen_order_idx ON public.ice_stories (last_seen_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ice_stories_updated_order_idx ON public.ice_stories (updated_at DESC, id DESC);

-- Recent publication checks and CHRT sync filter creation time, not publication time.
CREATE INDEX IF NOT EXISTS articles_public_created_order_idx ON public.articles (created_at DESC, id DESC)
  WHERE status = 'published' AND visibility = 'public';

-- Also support deployed readers that do not include the external-origin predicate.
CREATE INDEX IF NOT EXISTS job_listings_source_lookup_idx ON public.job_listings (source_key, source_external_id);
