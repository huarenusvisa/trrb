-- The live processing queue is only a small fraction of the story archive.
-- Lead with status so editorial reads do not scan every published/rejected story.
CREATE INDEX IF NOT EXISTS ice_stories_status_updated_idx ON public.ice_stories (status, updated_at DESC, id DESC);
