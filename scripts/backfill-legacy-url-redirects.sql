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

-- canonical_url can lag behind a later topic reassignment.  Topic routes have
-- hard canonical ownership, so point old URLs straight to the final route and
-- avoid a second redirect through the article route guard.
with final_topics as (
  select
    r.old_path,
    case
      when lower(coalesce(a.topic_key, '')) = 'trump'
        then '/trump/' || regexp_replace(r.new_path, '^/[^/]+/', '')
      when lower(coalesce(a.topic_key, '')) = 'ice'
        then '/ice/' || regexp_replace(r.new_path, '^/[^/]+/', '')
      else r.new_path
    end as final_path
  from public.url_redirects r
  join public.articles a on a.id = r.article_id
)
update public.url_redirects r
set new_path = f.final_path
from final_topics f
where r.old_path = f.old_path
  and r.new_path <> f.final_path;

commit;
