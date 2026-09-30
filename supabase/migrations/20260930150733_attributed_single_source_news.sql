-- Single-source attribution is an alternative to corroboration for regular news.
-- Keep the original audit verdict and all other checks, including manual routes.
SET lock_timeout = '5s';
DO $migration$
DECLARE prior_expression text; replacement text; updated_expression text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO STRICT prior_expression
 FROM pg_constraint WHERE conrelid='public.articles'::regclass
 AND conname='articles_china_hot_editorial_minimum';
 IF position('attributed_source' in prior_expression)>0 THEN RETURN; END IF;
 replacement := $expr$((metadata #>> '{editorial_review,source_chain_complete}'::text[]) = 'true'::text OR (
   metadata->>'editorial_depth' IN ('brief','standard')
   AND metadata#>>'{editorial_review,attributed_source}'='true'
   AND length(btrim(coalesce(metadata#>>'{editorial_review,attribution_evidence}','')))>=10
   AND metadata->>'reviewed_content_sha256'=encode(sha256(convert_to(coalesce(title,'')||chr(10)||coalesce(content,''),'UTF8')),'hex')
 ))$expr$;
 updated_expression := replace(prior_expression,
   $old$(metadata #>> '{editorial_review,source_chain_complete}'::text[]) = 'true'::text$old$, replacement);
 IF updated_expression = prior_expression THEN RAISE EXCEPTION 'Source review constraint shape changed'; END IF;
 ALTER TABLE public.articles DROP CONSTRAINT articles_china_hot_editorial_minimum;
 EXECUTE format('ALTER TABLE public.articles ADD CONSTRAINT articles_china_hot_editorial_minimum CHECK (%s) NOT VALID',updated_expression);
END $migration$;
