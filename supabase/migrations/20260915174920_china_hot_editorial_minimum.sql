-- New/current China Hot automated articles must meet the publication minimum,
-- including writes from old in-flight collectors and admin status toggles.
-- Historical/manual articles are outside this change. NOT VALID avoids scanning
-- the archive; the check is still enforced on new writes.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.articles'::regclass AND conname='articles_china_hot_editorial_minimum') THEN
    ALTER TABLE public.articles ADD CONSTRAINT articles_china_hot_editorial_minimum CHECK (
      coalesce(automation_source,'') <> 'china-hot-li-teacher-v2'
      OR coalesce(status,'') <> 'published'
      OR created_at < timestamptz '2026-09-15 00:00:00+00'
      OR (char_length(regexp_replace(regexp_replace(coalesce(content,''),'<[^>]*>','','g'),'[^㐀-鿿]','','g')) >= 800
          AND coalesce(cover_image,'') ~ '^https://[^[:space:]]+$')
    ) NOT VALID;
  END IF;
END $$;

-- Recoverable quarantine: retain original content, images and prior publication
-- metadata. Mark all linked candidate aliases so they cannot auto-retry it.
WITH held AS (
  UPDATE public.articles SET status='draft', visibility='private', review_status='manual_review', updated_at=now(),
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'quality_hold',true,'quality_hold_version','single-event-800-image-v1','quality_hold_at',now(),
      'quality_hold_reason','采编质量拦截：正文不足800字或缺少合适配图，需补充同一事件素材后重新编辑',
      'quality_hold_previous_status',status,'quality_hold_previous_visibility',visibility,
      'quality_hold_previous_published_at',published_at,'manual_review_required',true,
      'review_status','manual_review','automatic_publish',false,'publication_blocked_until_edited',true)
  WHERE automation_source='china-hot-li-teacher-v2' AND status='published'
    AND created_at >= timestamptz '2026-09-15 00:00:00+00'
    AND (char_length(regexp_replace(regexp_replace(coalesce(content,''),'<[^>]*>','','g'),'[^㐀-鿿]','','g')) < 800
      OR NOT(coalesce(cover_image,'') ~ '^https://[^[:space:]]+$'))
  RETURNING id
)
UPDATE public.news_candidates SET decision='review_required',updated_at=now(),
  decision_reason='采编质量拦截：原发布稿不足800字或无配图，已转回待编辑；禁止无新素材自动重试',
  ai_payload=coalesce(ai_payload,'{}'::jsonb) || jsonb_build_object(
    'quality_hold',true,'automatic_retry_exhausted',true,'processing_version','single-event-800-image-v1',
    'status','review_required','automatic_publish_blocked',true)
WHERE article_id IN (SELECT id FROM held);
