begin;
set local lock_timeout = '5s';
set local statement_timeout = '45s';
CREATE OR REPLACE FUNCTION public.apply_human_approved_article_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  approved_category text;
  target record;
begin
  -- A metadata-free no-op update used to repair links must not reclassify content.
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    return new;
  end if;
  approved_category := nullif(trim(coalesce(new.metadata->>'human_category_override', '')), '');

  -- Explicitly reviewed legacy knowledge placement takes precedence over
  -- broad ICE/China keyword routing. No publication or permission changes.
  if new.metadata->>'knowledge_migration_batch' = '20260923-asylum-knowledge'
     and (approved_category like '移民美国·%·历史知识文章'
          or approved_category = 'ICE执法与警情') then
    new.category_name := approved_category;
    if approved_category = 'ICE执法与警情' then
      select id into new.category_id from public.categories
      where slug = 'iceandpolice' and is_active = true limit 1;
      if new.category_id is null then raise exception 'ICE category missing'; end if;
      new.topic_key := 'ice';
      new.primary_section := 'ice';
    else
      new.category_id := null;
      new.topic_key := null;
      new.primary_section := 'news';
    end if;
    new.canonical_url := 'https://trrb.net/' || new.primary_section || '/' || new.slug;
    return new;
  end if;

  -- SQL `NULL NOT IN (...)` evaluates to NULL, not TRUE. Without this
  -- explicit guard, ordinary articles with no human override fell through to
  -- the lookup below and failed every insert with an override of <NULL>.
  if approved_category is null or approved_category not in (
    'ICE执法动态', '美国时政', '美国警情', '移民美国', '中国热门头条', '中国政治', 'ICE执法与警情'
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
    where is_active = true and (
      (approved_category in ('ICE执法动态', '美国警情', 'ICE执法与警情') and slug = 'iceandpolice')
      or (approved_category not in ('ICE执法动态', '美国警情', 'ICE执法与警情') and name = approved_category)
    )
    order by id
    limit 1;
  end if;

  if target.id is null then
    raise exception 'Active category not found for human override: %', approved_category;
  end if;

  new.category_id := target.id;
  new.category_name := case when approved_category in ('ICE执法动态', '美国警情') then approved_category else target.name end;
  new.primary_section := case approved_category when 'ICE执法动态' then 'ice' when '美国警情' then 'us-crime' else target.slug end;
  new.topic_key := case when approved_category = 'ICE执法动态' then 'ice' when approved_category = 'ICE执法与警情' then new.topic_key else null end;
  return new;
end;
$function$;


-- The slug/publication guard must only run when those fields are written.
-- A link repair must not make a private published article public.
drop trigger trg_lock_article_slug on public.articles;
create trigger trg_lock_article_slug
before update of slug, status on public.articles
for each row execute function public.lock_article_slug_after_publish();

-- Keep historical article category names as subtypes and preserve article URLs.
-- The category foreign key always points to the current CMS collection.
create or replace function public.align_article_cms_category_link()
returns trigger language plpgsql set search_path = '' as $$
declare
  target_slug text;
  target_id uuid;
begin
  target_slug := case
    when new.category_name in ('ICE', 'ICE执法动态', 'ICE执法', 'ICE执法追踪', 'ICE新闻', '驱逐快报', '美国警情', '美国执法与警情', 'ICE执法与警情') then 'iceandpolice'
    when new.category_name in ('热门头条', '中国热门头条') then 'hot-headlines'
    when new.category_name = '美国时政' then 'us-politics'
    when new.category_name = '中国政治' then 'china-politics'
    else null
  end;
  if target_slug is not null then
    select id into target_id from public.categories where slug = target_slug and is_active = true limit 1;
    if target_id is not null then new.category_id := target_id; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists zzzz_articles_cms_category_link on public.articles;
create trigger zzzz_articles_cms_category_link
before insert or update on public.articles
for each row execute function public.align_article_cms_category_link();

-- Reclassifiers are deliberately not invoked by this no-op updated_at repair.
-- Snapshot all non-link values and abort atomically if anything else changes.
create temporary table cms_link_repair_before on commit drop as
select a.id, c.id as expected_category_id, to_jsonb(a) - 'category_id' - 'updated_at' as preserved
from public.articles a join public.categories c on c.is_active and c.slug = case
  when a.category_name in ('ICE', 'ICE执法动态', 'ICE执法', 'ICE执法追踪', 'ICE新闻', '驱逐快报', '美国警情', '美国执法与警情', 'ICE执法与警情') then 'iceandpolice'
  when a.category_name in ('热门头条', '中国热门头条') then 'hot-headlines'
  when a.category_name = '美国时政' then 'us-politics'
  when a.category_name = '中国政治' then 'china-politics'
  else null end
where a.category_id is distinct from c.id;

update public.articles a set updated_at = a.updated_at
from cms_link_repair_before b where a.id = b.id;
do $$
begin
  if exists (
    select 1 from public.articles a join cms_link_repair_before b using(id)
    where a.category_id is distinct from b.expected_category_id
      or (to_jsonb(a) - 'category_id' - 'updated_at') is distinct from b.preserved
  ) then raise exception 'Category link repair changed protected article values'; end if;
end;
$$;

commit;
