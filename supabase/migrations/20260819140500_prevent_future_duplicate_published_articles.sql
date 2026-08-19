create or replace function public.trrb_normalized_news_title(value text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(
    lower(coalesce(value, '')),
    '[[:space:][:punct:]，。！？：；、“”‘’（）【】《》—…·]+',
    '',
    'g'
  );
$$;

create or replace function public.trrb_prevent_duplicate_published_article()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  duplicate_id uuid;
  normalized_new text;
begin
  if new.status is distinct from 'published' or btrim(coalesce(new.title, '')) = '' then
    return new;
  end if;

  normalized_new := public.trrb_normalized_news_title(new.title);
  if length(normalized_new) < 8 then
    return new;
  end if;

  select a.id
    into duplicate_id
    from public.articles a
   where a.status = 'published'
     and a.id is distinct from new.id
     and public.trrb_normalized_news_title(a.title) = normalized_new
   order by a.published_at desc nulls last, a.created_at desc
   limit 1;

  if duplicate_id is not null then
    raise exception using
      errcode = '23505',
      message = 'duplicate published article title',
      detail = duplicate_id::text,
      hint = 'Reuse or update the existing published article instead of publishing a duplicate.';
  end if;

  return new;
end;
$$;

drop trigger if exists trrb_prevent_duplicate_published_article on public.articles;
create trigger trrb_prevent_duplicate_published_article
before insert or update of status, title
on public.articles
for each row
execute function public.trrb_prevent_duplicate_published_article();
