-- TRRB dual placement: keep the editor-selected primary category while retaining ICE topic membership.
-- One article / one URL can therefore appear in both its editorial category and the ICE topic surface.

create or replace function public.assign_article_category_from_topic()
returns trigger
language plpgsql
as $$
declare
  target record;
  body_text text;
  ice_match boolean;
  has_primary_non_ice_category boolean;
begin
  body_text := coalesce(new.title, '') || ' ' || coalesce(new.summary, '') || ' ' || coalesce(new.content, '');

  if body_text ~* '(特朗普|川普|Donald[[:space:]]+Trump|President[[:space:]]+Trump)' then
    new.topic_key := 'trump';
  end if;

  ice_match :=
       lower(coalesce(new.topic_key, '')) = 'ice'
    or lower(coalesce(new.slug, '')) like 'ice-%'
    or body_text ~* '(\mICE\M|\mERO\M|\mHSI\M|\mCBP\M|\mDHS\M|移民及海关执法局|移民海关执法局|美国移民执法|边境移民执法)'
    or (
      new.category_name in ('驱逐快报','驱逐新闻','ICE动态','ICE','ICE执法动态','ICE执法追踪','ICE新闻')
      and body_text ~* '(遣返|递解|驱逐出境|移民拘留|移民执法|边境执法)'
    );

  -- A real editorial category is the article's primary category. ICE becomes a topic membership,
  -- rather than overwriting that category. Generic/legacy placeholders remain eligible for auto assignment.
  has_primary_non_ice_category :=
       coalesce(btrim(new.category_name), '') <> ''
    and new.category_name not in (
      '新闻','未分类','驱逐快报','驱逐新闻','ICE动态','ICE','ICE执法','ICE执法动态','ICE执法追踪','ICE新闻'
    );

  if ice_match then
    -- Always retain ICE topical membership so /ice and ICE topic feeds can include the article.
    new.topic_key := 'ice';

    -- Only choose ICE as the primary category when no editor-selected category exists.
    if not has_primary_non_ice_category then
      select id, name into target
      from public.categories
      where lower(slug) = 'ice'
      limit 1;

      if target.id is not null then
        new.category_id := target.id;
        new.category_name := target.name;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists articles_assign_category_from_topic on public.articles;
create trigger articles_assign_category_from_topic
before insert or update of topic_key, slug, title, summary, content, category_id, category_name on public.articles
for each row execute function public.assign_article_category_from_topic();

-- Repair the article that exposed this issue: primary category = 重要新闻, topic = ICE.
-- Keep its existing slug/URL unchanged; do not duplicate the article record.
with important_category as (
  select id, name
  from public.categories
  where name = '重要新闻'
     or lower(coalesce(slug, '')) in ('important', 'important-news')
  order by case when name = '重要新闻' then 0 else 1 end, sort_order nulls last
  limit 1
)
update public.articles a
set category_id = c.id,
    category_name = c.name,
    topic_key = 'ice'
from important_category c
where lower(coalesce(a.slug, '')) like '%msxdhkl3-85c026%'
   or a.title like '5000字文章深扒庇护欺诈%';
