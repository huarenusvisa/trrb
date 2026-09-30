-- Run with psql in autocommit mode: CREATE INDEX CONCURRENTLY must not be
-- enclosed in a migration transaction. Only title keys, never body copies.
set lock_timeout='3s';
set statement_timeout='5min';
create index concurrently if not exists articles_published_title_digest_idx
on public.articles (md5(public.trrb_normalized_news_title(title)))
where status='published';

do $verify$
begin
  if not exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
    and c.relname='articles_published_title_digest_idx' and i.indisvalid) then
    raise exception 'Title lookup index is not valid; retain existing duplicate guard';
  end if;
end $verify$;

begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
create or replace function public.trrb_prevent_duplicate_published_article()
returns trigger language plpgsql set search_path=public as $function$
declare duplicate_id uuid;normalized_new text;
begin
  if new.status is distinct from 'published' or btrim(coalesce(new.title,''))='' then return new;end if;
  normalized_new:=public.trrb_normalized_news_title(new.title);
  if length(normalized_new)<8 then return new;end if;
  if tg_op='UPDATE' and old.status='published'
    and public.trrb_normalized_news_title(old.title)=normalized_new then return new;end if;
  select a.id into duplicate_id from public.articles a
    where a.status='published' and a.id is distinct from new.id
    and md5(public.trrb_normalized_news_title(a.title))=md5(normalized_new)
    and public.trrb_normalized_news_title(a.title)=normalized_new
    order by a.published_at desc nulls last,a.created_at desc limit 1;
  if duplicate_id is not null then
    raise exception using errcode='23505',message='duplicate published article title',detail=duplicate_id::text,
    hint='Reuse or update the existing published article instead of publishing a duplicate.';
  end if;
  return new;
end $function$;
insert into supabase_migrations.schema_migrations(version,name,statements)
values('20260930080000','manual_publish_title_lookup',array['Concurrent fixed-width normalized title index; indexed duplicate guard.'])
on conflict(version) do nothing;
commit;
