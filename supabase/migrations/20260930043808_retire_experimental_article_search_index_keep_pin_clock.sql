-- Applied as 20260930043808. Only the failed experimental search implementation
-- is removed; article records, article history and 48-hour pin rules remain.
set lock_timeout='5s';
drop trigger if exists trrb_article_search_sync on public.articles;
drop function if exists public.trrb_search_articles_v2(text[],boolean,text,text,integer,integer,uuid,boolean,boolean);
drop function if exists private.trrb_sync_article_search();
drop table if exists private.article_search_documents;
drop function if exists private.trrb_search_keys(text);
drop function if exists private.trrb_search_text(text,text,text);
notify pgrst,'reload schema';
