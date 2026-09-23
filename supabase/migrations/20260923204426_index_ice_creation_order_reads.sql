-- Reply filtering and oldest-first intake use creation time, not source time.
CREATE INDEX IF NOT EXISTS ice_posts_created_order_idx ON public.ice_posts (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ice_posts_processing_created_idx ON public.ice_posts (processing_status, created_at, id);
CREATE INDEX IF NOT EXISTS ice_stories_created_order_idx ON public.ice_stories (created_at, id);
