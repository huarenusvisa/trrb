-- Final retirement of the former deport category and strict ICE classification.

update public.categories
set name = 'ICE执法动态',
    is_active = true,
    show_in_navigation = true,
    show_on_homepage = true,
    show_in_nav = true,
    show_on_home = true,
    auto_fetch = true,
    ai_rewrite = true,
    auto_publish = true,
    include_in_sitemap = true,
    include_in_google_news = true,
    include_in_rss = true,
    seo_title = 'ICE执法动态与实时追踪｜唐人日报',
    seo_description = '追踪美国ICE、ERO、HSI、CBP及DHS执法、拘留、遣返和移民政策动态。'
where lower(slug) = 'ice';

update public.categories
set is_active = false,
    show_in_navigation = false,
    show_on_homepage = false,
    show_in_nav = false,
    show_on_home = false,
    auto_fetch = false,
    ai_rewrite = false,
    auto_publish = false,
    include_in_sitemap = false,
    include_in_google_news = false,
    include_in_rss = false,
    push_x = false,
    push_telegram = false
where lower(coalesce(slug, '')) = 'deport'
   or name in ('驱逐快报','驱逐新闻');

create or replace function public.assign_article_category_from_topic()
returns trigger language plpgsql as $$
declare
  target record;
  article_text text;
  explicit_agency boolean;
  legacy_deport boolean;
begin
  article_text := coalesce(new.title, '') || ' ' || coalesce(new.summary, '') || ' ' || coalesce(new.content, '');
  explicit_agency := article_text ~* '(\mICE\M|\mERO\M|\mHSI\M|\mCBP\M|\mDHS\M|移民及海关执法局|移民海关执法局|国土安全部)';
  legacy_deport := new.category_name in ('驱逐快报','驱逐新闻','ICE动态','ICE','ICE执法动态')
                   and article_text ~* '(移民执法|遣返|递解|移民拘留|驱逐出境|边境执法|抓捕移民)';

  if lower(coalesce(new.topic_key, '')) = 'ice'
     or lower(coalesce(new.slug, '')) like 'ice-%'
     or explicit_agency
     or legacy_deport then
    select id, name into target
    from public.categories
    where lower(slug) = 'ice'
    limit 1;

    if target.id is not null then
      new.category_id := target.id;
      new.category_name := target.name;
      new.topic_key := 'ice';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists articles_assign_category_from_topic on public.articles;
create trigger articles_assign_category_from_topic
before insert or update of topic_key, slug, title, summary, content, category_id, category_name on public.articles
for each row execute function public.assign_article_category_from_topic();

-- Normalize all true ICE records to the one shared category/topic source.
update public.articles a
set category_id = c.id,
    category_name = c.name,
    topic_key = 'ice'
from public.categories c
where lower(c.slug) = 'ice'
  and (
    lower(coalesce(a.topic_key, '')) = 'ice'
    or lower(coalesce(a.slug, '')) like 'ice-%'
    or (coalesce(a.title, '') || ' ' || coalesce(a.summary, '') || ' ' || coalesce(a.content, ''))
       ~* '(\mICE\M|\mERO\M|\mHSI\M|\mCBP\M|\mDHS\M|移民及海关执法局|移民海关执法局|国土安全部)'
    or (
      a.category_name in ('驱逐快报','驱逐新闻','ICE动态','ICE','ICE执法动态')
      and (coalesce(a.title, '') || ' ' || coalesce(a.summary, '') || ' ' || coalesce(a.content, ''))
          ~* '(移民执法|遣返|递解|移民拘留|驱逐出境|边境执法|抓捕移民)'
    )
  );
