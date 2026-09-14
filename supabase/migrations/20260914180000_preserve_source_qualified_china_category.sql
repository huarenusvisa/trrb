-- Keep source-approved China social/business reports in their intended section.
CREATE OR REPLACE FUNCTION public.enforce_china_hot_headline_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  target record;
  article_text text;
  target_name text;
begin
  if new.category_name not in ('热门头条', '中国热门头条') then
    return new;
  end if;

  -- The source-specific collector checks both source and edited copy. Honor
  -- that explicit classification instead of applying the old geography-only
  -- heuristic a second time. This is not a human-review override.
  if new.automation_source = 'china-hot-li-teacher-v2'
     and new.source_account = '@whyyoutouzhele'
     and new.metadata->>'source_category_qualified' = 'true'
     and new.metadata->>'category_policy_version' = 'source-social-v3'
     and new.status = 'published' then
    select id, name, slug into target
    from public.categories
    where is_active = true and slug = 'hot-headlines'
    limit 1;
    if target.id is null then
      raise exception 'Active hot-headlines category not found';
    end if;
    new.category_id := target.id;
    new.category_name := target.name;
    new.primary_section := target.slug;
    new.topic_key := 'china';
    return new;
  end if;

  if public.trrb_is_china_hot_headline(new.title, new.summary, new.content) then
    -- Dynamic PLUS and the existing public endpoints continue to consume the
    -- legacy key even though every user-facing label says 中国热门头条.
    new.category_name := '热门头条';
    return new;
  end if;

  article_text := lower(coalesce(new.title, '') || ' ' || coalesce(new.summary, '') || ' ' || left(coalesce(new.content, ''), 1200));
  if article_text ~ '(警方|警察|警局|枪击|刺伤|命案|抢劫|盗窃|诈骗|纵火|酒驾|醉驾|刑事指控|嫌疑人|法院判刑)' then
    target_name := '美国警情';
  elsif article_text ~ '(美国|白宫|国会|参议院|众议院|特朗普|川普|佛罗里达|纽约|洛杉矶|芝加哥|加州|德州|联邦法院|最高法院|ice|dhs|fbi)' then
    target_name := '美国时政';
  else
    target_name := '重要新闻';
  end if;

  select id, name into target
  from public.categories
  where name = target_name
  order by is_active desc
  limit 1;

  new.category_name := target_name;
  new.category_id := target.id;
  return new;
end;
$function$

