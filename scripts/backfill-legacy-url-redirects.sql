-- Idempotent repair for WordPress-era article URLs. Run with the Supabase SQL
-- editor or migration runner after restoring legacy articles.
begin;

delete from public.url_redirects
where lower(trim(old_path)) = lower(trim(new_path));

with source_rows as (
  select
    id as article_id,
    lower(regexp_replace(split_part(split_part(source_url, '#', 1), '?', 1), '^https?://(www\.)?trrb\.net', '', 'i')) as old_path,
    regexp_replace(split_part(split_part(canonical_url, '#', 1), '?', 1), '^https?://(www\.)?trrb\.net', '', 'i') as new_path
  from public.articles
  where status = 'published'
    and coalesce(visibility, 'public') = 'public'
    and source_url ~* '^https?://(www\.)?trrb\.net/'
    and canonical_url ~* '^https?://(www\.)?trrb\.net/'
), valid_rows as (
  select article_id, old_path, new_path
  from source_rows
  where old_path <> '' and new_path <> '' and old_path <> new_path
)
insert into public.url_redirects (old_path, new_path, article_id)
select old_path, new_path, article_id
from valid_rows
on conflict (old_path) do update
set new_path = excluded.new_path,
    article_id = excluded.article_id;

commit;
