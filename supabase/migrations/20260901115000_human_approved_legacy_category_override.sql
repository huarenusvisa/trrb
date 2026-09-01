-- Human-reviewed legacy migrations are an explicit editorial decision. Run
-- this trigger last so automated topic classifiers cannot silently undo that
-- decision during insert, repair, or a later article edit.

create or replace function public.apply_human_approved_article_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  approved_category text;
  target record;
begin
  approved_category := nullif(trim(coalesce(new.metadata->>'human_category_override', '')), '');

  if approved_category not in (
    'ICE执法动态', '美国时政', '美国警情', '移民美国', '中国热门头条'
  ) then
    return new;
  end if;

  if approved_category = '中国热门头条' then
    select id, name, slug into target
    from public.categories
    where is_active = true
      and (lower(coalesce(slug, '')) = 'hot-headlines' or name in ('热门头条', '中国热门头条'))
    order by
      case when lower(coalesce(slug, '')) = 'hot-headlines' then 0 else 1 end,
      case when name = '热门头条' then 0 else 1 end
    limit 1;
  else
    select id, name, slug into target
    from public.categories
    where is_active = true and name = approved_category
    order by id
    limit 1;
  end if;

  if target.id is null then
    raise exception 'Active category not found for human override: %', approved_category;
  end if;

  new.category_id := target.id;
  new.category_name := target.name;
  new.primary_section := target.slug;
  new.topic_key := case when approved_category = 'ICE执法动态' then 'ice' else null end;
  return new;
end;
$$;

drop trigger if exists zzz_articles_human_category_override on public.articles;
create trigger zzz_articles_human_category_override
before insert or update on public.articles
for each row execute function public.apply_human_approved_article_category();

