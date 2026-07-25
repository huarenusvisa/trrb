-- TRRB Trump topic + media/category cleanup
-- Keep Trump as a topic, not a standalone news category.

-- Retire the standalone Trump category from every public surface.
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
where lower(coalesce(slug, '')) = 'trump'
   or lower(coalesce(name, '')) = 'trump';

-- Every Trump-related story participates in the Trump topic feed, regardless of its normal news category.
update public.articles
set topic_key = 'trump'
where (coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, ''))
      ~* '(特朗普|川普|Donald[[:space:]]+Trump|President[[:space:]]+Trump)'
  and lower(coalesce(topic_key, '')) <> 'trump';

-- Stories previously assigned to the standalone Trump category return to the normal U.S. politics channel.
update public.articles a
set category_id = c.id,
    category_name = c.name,
    topic_key = 'trump'
from public.categories c
where (lower(coalesce(c.slug, '')) = 'politics' or c.name = '美国时政')
  and (lower(coalesce(a.category_name, '')) = 'trump'
       or a.category_id in (select id from public.categories where lower(coalesce(slug, '')) = 'trump'));

-- Replace the earlier broad ICE trigger. Generic words such as “拘留” alone must never classify ordinary crime news as ICE.
create or replace function public.assign_article_category_from_topic()
returns trigger language plpgsql as $$
declare
  target record;
  body_text text;
begin
  body_text := coalesce(new.title, '') || ' ' || coalesce(new.summary, '') || ' ' || coalesce(new.content, '');

  if body_text ~* '(特朗普|川普|Donald[[:space:]]+Trump|President[[:space:]]+Trump)' then
    new.topic_key := 'trump';
  end if;

  if lower(coalesce(new.topic_key, '')) = 'ice'
     or lower(coalesce(new.slug, '')) like 'ice-%'
     or body_text ~* '(\mICE\M|\mERO\M|\mHSI\M|\mCBP\M|\mDHS\M|移民及海关执法局|移民海关执法局|美国移民执法|边境移民执法)'
     or (
       new.category_name in ('驱逐快报','驱逐新闻','ICE动态','ICE','ICE执法动态')
       and body_text ~* '(遣返|递解|驱逐出境|移民拘留|移民执法|边境执法)'
     ) then
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

-- Remove category placeholder URLs stored as if they were real article covers.
update public.articles
set cover_image = ''
where coalesce(cover_image, '') ~* '(category-placeholders|image-placeholder\.svg|tang-ren-daily-placeholder)';
