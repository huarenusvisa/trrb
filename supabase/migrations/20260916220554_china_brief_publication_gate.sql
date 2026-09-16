-- Align the database write gate with the authorized short-news policy.
-- NOT VALID preserves historical rows; all new/updated rows are checked.
begin;
alter table public.articles drop constraint if exists articles_china_hot_editorial_minimum;
alter table public.articles add constraint articles_china_hot_editorial_minimum check (
 coalesce(automation_source,'') <> 'china-hot-li-teacher-v2'
 or coalesce(status,'') <> 'published'
 or coalesce(created_at < '2026-09-15T00:00:00Z'::timestamptz,false)
 or coalesce((
   coalesce(cover_image,'') ~ '^https://[^[:space:]]+$'
   and (
     char_length(regexp_replace(regexp_replace(coalesce(content,''),'<[^>]*>','','g'),'[^㐀-鿿]','','g')) >= 800
     or (
       char_length(regexp_replace(regexp_replace(coalesce(content,''),'<[^>]*>','','g'),'[^㐀-鿿]','','g')) > 0
       and metadata->>'publication_scope' = 'topic_only'
       and metadata->>'homepage_focus_override' = 'exclude'
       and metadata#>>'{editorial_review,single_event}' = 'true'
       and metadata#>>'{editorial_review,grounded}' = 'true'
       and metadata#>>'{editorial_review,sufficient}' = 'true'
       and metadata#>>'{editorial_review,image_relevant}' = 'true'
       and metadata#>>'{editorial_review,fresh_hot_event}' = 'true'
       and length(btrim(coalesce(metadata#>>'{editorial_review,freshness_evidence}',''))) > 0
       and metadata->>'appears_old_news' = 'false'
       and source_created_at <= published_at
       and source_created_at >= published_at - interval '72 hours'
       and (
         char_length(regexp_replace(regexp_replace(coalesce(content,''),'<[^>]*>','','g'),'[^㐀-鿿]','','g')) >= 300
         or metadata->>'context_research_attempted' = 'true'
       )
     )
   )
 ),false)
) not valid;
commit;
