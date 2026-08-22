-- Keep the existing internal category key and /hot-headlines route for Dynamic
-- PLUS compatibility, while enforcing that the feed contains China news only.

update public.categories
set seo_title = '中国热门头条｜唐人日报',
    seo_description = '唐人日报中国热门头条，只汇集中国大陆社会、民生、公共事件与网络热点。',
    seo_keywords = '中国热门头条,中国新闻,中国社会热点,唐人日报',
    ai_prompt = '仅收录以中国大陆事件、地点、机构或社会议题为主体的新闻。美国及其他国家新闻不得进入本栏目。',
    updated_at = now()
where name = '热门头条' or lower(coalesce(slug, '')) in ('hot', 'hot-headlines');

create or replace function public.trrb_is_china_hot_headline(
  article_title text,
  article_summary text,
  article_content text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with normalized as (
    select
      lower(coalesce(article_title, '')) as headline,
      lower(
        coalesce(article_title, '') || ' ' ||
        coalesce(article_summary, '') || ' ' ||
        left(coalesce(article_content, ''), 1200)
      ) as primary_text
  ), positions as (
    select
      regexp_instr(headline, '(中国|中国大陆|大陆|内地|中共中央|国务院|全国人大|全国政协|最高人民法院|最高人民检察院|公安部|教育部|财政部|商务部|外交部|国家卫健委|国家发改委|中国人民银行|央行|北京|上海|天津|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|内蒙古|广西|西藏|宁夏|新疆|广州|深圳|武汉|成都|西安|杭州|南京|苏州|郑州|长沙|合肥|济南|青岛|厦门|福州|南昌|昆明|贵阳|海口|乌鲁木齐|哈尔滨|长春|沈阳|大连|抖音|微博|微信|华为|腾讯|百度|阿里巴巴|京东|拼多多|小米|比亚迪|高考)') as china_headline_pos,
      regexp_instr(headline, '(美国|美方|白宫|国会|参议院|众议院|特朗普|川普|联邦调查局|国土安全部|纽约|洛杉矶|芝加哥|旧金山|佛罗里达|加州|德州|联邦法院|美国最高法院|fbi|ice|dhs)') as us_headline_pos,
      regexp_instr(primary_text, '(中国|中国大陆|大陆|内地|中共中央|国务院|全国人大|全国政协|最高人民法院|最高人民检察院|公安部|教育部|财政部|商务部|外交部|国家卫健委|国家发改委|中国人民银行|央行|北京|上海|天津|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|内蒙古|广西|西藏|宁夏|新疆|广州|深圳|武汉|成都|西安|杭州|南京|苏州|郑州|长沙|合肥|济南|青岛|厦门|福州|南昌|昆明|贵阳|海口|乌鲁木齐|哈尔滨|长春|沈阳|大连|抖音|微博|微信|华为|腾讯|百度|阿里巴巴|京东|拼多多|小米|比亚迪|高考)') as china_primary_pos
    from normalized
  )
  select china_primary_pos > 0
    and (us_headline_pos = 0 or (china_headline_pos > 0 and china_headline_pos <= us_headline_pos))
  from positions;
$$;

create or replace function public.enforce_china_hot_headline_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target record;
  article_text text;
  target_name text;
begin
  if new.category_name not in ('热门头条', '中国热门头条') then
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
$$;

drop trigger if exists zz_articles_enforce_china_hot_headlines on public.articles;
create trigger zz_articles_enforce_china_hot_headlines
before insert or update of title, summary, content, category_id, category_name on public.articles
for each row execute function public.enforce_china_hot_headline_category();

-- Re-run the new rule against every existing item in the legacy feed. Valid
-- China stories retain the original category key; mistaken U.S./world stories
-- are moved out so Dynamic PLUS and every public surface immediately agree.
update public.articles
set category_name = category_name,
    updated_at = now()
where category_name in ('热门头条', '中国热门头条');
