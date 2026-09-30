DO $migration$
DECLARE old_def text; new_def text;
BEGIN
 SET LOCAL lock_timeout='5s';
 SELECT pg_get_constraintdef(oid) INTO old_def FROM pg_constraint WHERE conname='articles_china_hot_editorial_minimum' AND conrelid='public.articles'::regclass;
 new_def:=replace(old_def, $old$length(COALESCE((metadata ->> 'manual_verification_note'::text), ''::text)) >= 10$old$, $new$length(btrim(COALESCE((metadata ->> 'manual_verification_note'::text), ''::text))) >= 1$new$);
 IF old_def IS NULL OR new_def=old_def THEN RAISE EXCEPTION 'Unexpected manual verification constraint'; END IF;
 ALTER TABLE public.articles DROP CONSTRAINT articles_china_hot_editorial_minimum;
 EXECUTE 'ALTER TABLE public.articles ADD CONSTRAINT articles_china_hot_editorial_minimum '||new_def;
END $migration$;
