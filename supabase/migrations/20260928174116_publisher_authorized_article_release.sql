-- Preserve existing automatic/manual gates. Add separately audited publication
-- routes without rewriting reviewer verdicts or claiming new human verification.
-- Article writes remain restricted by the existing admin RLS policies.
SET lock_timeout = '5s';
DO $migration$
DECLARE prior_expression text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT prior_expression
 FROM pg_constraint WHERE conrelid='public.articles'::regclass
 AND conname='articles_china_hot_editorial_minimum';
 IF position('publisher_authorized_release' in prior_expression)>0 THEN RETURN; END IF;
 ALTER TABLE public.articles DROP CONSTRAINT articles_china_hot_editorial_minimum;
 EXECUTE format($constraint$
 ALTER TABLE public.articles ADD CONSTRAINT articles_china_hot_editorial_minimum
 CHECK ((%s) OR coalesce((
   metadata->>'homepage_focus_override'='exclude'
   AND coalesce(source_url,'') ~ '^https://[^[:space:]]+$'
   AND char_length(regexp_replace(regexp_replace(coalesce(content,''),'<[^>]*>','','g'),'[^㐀-鿿]','','g')) >= 50
   AND coalesce(content,'') !~ '自动加工未完成|未经编辑不得发布|【编辑提示】|此稿未通过自动加工质量检查'
   AND (
     (metadata->>'publication_mode'='reviewed_regular'
      AND metadata->>'reviewed_content_sha256'=encode(sha256(convert_to(coalesce(title,'')||chr(10)||coalesce(content,''),'UTF8')),'hex')
      AND metadata->>'editorial_policy_version'='unified-news-research-2000-3500-v2'
      AND metadata->>'editorial_depth' IN ('brief','standard')
      AND metadata->>'appears_old_news'='false'
      AND metadata#>>'{editorial_review,single_event}'='true'
      AND metadata#>>'{editorial_review,grounded}'='true'
      AND metadata#>>'{editorial_review,sufficient}'='true'
      AND metadata#>>'{editorial_review,source_chain_complete}'='true'
      AND metadata#>>'{editorial_review,analysis_grounded}'='true'
      AND metadata#>>'{editorial_review,court_status_correct}'='true'
      AND metadata#>>'{editorial_review,fresh_hot_event}'='false'
      AND length(btrim(coalesce(metadata#>>'{editorial_review,freshness_evidence}','')))>0
      AND (metadata#>>'{editorial_review,image_relevant}'='true' OR (coalesce(cover_image,'')='' AND metadata->>'text_only_verified'='true'))
      AND source_created_at BETWEEN published_at-interval '12 hours' AND published_at)
     OR
     (metadata#>>'{publisher_authorized_release,version}'='1'
      AND metadata#>>'{publisher_authorized_release,approved}'='true'
      AND metadata#>>'{publisher_authorized_release,content_sha256}'=encode(sha256(convert_to(coalesce(title,'')||chr(10)||coalesce(content,''),'UTF8')),'hex')
      AND metadata#>>'{publisher_authorized_release,source_url}'=source_url
      AND length(coalesce(metadata#>>'{publisher_authorized_release,approved_by}',''))>0
      AND length(coalesce(metadata#>>'{publisher_authorized_release,instruction}',''))>=10
      AND length(coalesce(metadata#>>'{publisher_authorized_release,approved_at}',''))>0)
   )
 ),false)) NOT VALID
 $constraint$,prior_expression);
END $migration$;
