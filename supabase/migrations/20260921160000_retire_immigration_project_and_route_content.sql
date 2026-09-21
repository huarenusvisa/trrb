-- Retire the legacy news project named exactly "移民美国".
-- The hierarchical knowledge hub categories beginning with "移民美国·" remain active.

create or replace function public.route_retired_immigration_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  article_text text;
  target record;
begin
  if new.category_name is distinct from '移民美国' then
    return new;
  end if;

  article_text := coalesce(new.title, '') || ' ' || coalesce(new.summary, '') || ' ' || left(coalesce(new.content, ''), 2400);
  new.category_id := null;
  new.topic_key := null;
  new.metadata := coalesce(new.metadata, '{}'::jsonb) - 'human_category_override';

  if article_text ~* '((^|[^A-Za-z])ICE([^A-Za-z]|$|执法|拘|抓|逮|遣|驱|突|搜)|移民及海关执法局|移民与海关执法局|移民和海关执法局)'
     and article_text ~* '(抓捕|拘捕|逮捕|拘留|羁押|遣返|递解|驱逐出境|突袭|搜捕|通缉|执法行动|查获|arrest|detain|deport|removal|raid|warrant)' then
    select id, name into target from public.categories where lower(slug) = 'ice' limit 1;
    new.category_id := target.id;
    new.category_name := coalesce(target.name, 'ICE执法动态');
    new.topic_key := 'ice';
  elsif article_text ~* '(I-?485|境内调整身份|adjustment of status)' then
    new.category_name := '移民美国·境内身份转换·I-485境内调整身份·官方政策动态';
  elsif article_text ~* '(I-?130A?|petition for alien relative|亲属移民申请)' then
    new.category_name := '移民美国·家庭移民·I-130亲属移民申请·官方政策动态';
  elsif article_text ~* '(I-?140|immigrant petition for alien worker)' then
    new.category_name := '移民美国·职业移民·I-140职业移民申请·官方政策动态';
  elsif article_text ~* '(I-?589|affirmative asylum|庇护申请|庇护面谈)' then
    new.category_name := '移民美国·人道主义庇护·政治庇护·官方政策动态';
  elsif article_text ~* '(I-?765|employment authorization|(^|[^A-Za-z])EAD([^A-Za-z]|$)|工卡)' then
    new.category_name := '移民美国·境内身份转换·EAD工卡·官方政策动态';
  elsif article_text ~* '(I-?131|advance parole|旅行许可|回美证)' then
    new.category_name := '移民美国·境内身份转换·Advance Parole旅行许可·官方政策动态';
  elsif article_text ~* '(N-?400|naturalization|入籍申请)' then
    new.category_name := '移民美国·入籍美国公民·N-400入籍申请·官方政策动态';
  elsif article_text ~* '(N-?600|certificate of citizenship|公民证明)' then
    new.category_name := '移民美国·入籍美国公民·N-600公民证明·官方政策动态';
  elsif article_text ~* '(逮捕|拘捕|被捕|起诉|刑事指控|枪击|命案|谋杀|诈骗|贩毒|绑架|搜查令|通缉|(^|[^A-Za-z])FBI([^A-Za-z]|$)|联邦调查局|警方|警察)' then
    select id, name into target from public.categories where lower(slug) = 'crime' or name = '美国警情' order by (name = '美国警情') desc limit 1;
    new.category_id := target.id;
    new.category_name := coalesce(target.name, '美国警情');
  elsif article_text ~* '(白宫|国会|参议院|众议院|总统|州长|行政命令|最高法院|联邦法院|法案|听证会|政府政策|政策调整|congress|white house|supreme court)' then
    select id, name into target from public.categories where lower(slug) = 'politics' or name = '美国时政' order by (name = '美国时政') desc limit 1;
    new.category_id := target.id;
    new.category_name := coalesce(target.name, '美国时政');
  else
    new.category_name := '移民美国·境内身份转换·USCIS政策与表格·历史归档';
  end if;

  return new;
end;
$$;

drop trigger if exists aa_articles_route_retired_immigration_category on public.articles;
create trigger aa_articles_route_retired_immigration_category
before insert or update of topic_key, slug, title, summary, content, category_id, category_name, status on public.articles
for each row execute function public.route_retired_immigration_category();

-- Run every legacy row through the new router while its category record still exists.
update public.articles
set category_name = '移民美国', updated_at = now()
where category_name = '移民美国';

-- Remove stale foreign-key links from already hierarchical knowledge articles.
update public.articles
set category_id = null, updated_at = now()
where category_id in (
  select id from public.categories where name = '移民美国' or lower(slug) = 'immigration'
);

-- Retire old manual overrides before deleting the category. Otherwise the
-- legacy override trigger attempts to restore the category during FK cleanup.
update public.articles
set metadata = coalesce(metadata, '{}'::jsonb) - 'human_category_override',
    updated_at = now()
where coalesce(metadata->>'human_category_override', '') = '移民美国';

delete from public.categories
where name = '移民美国' or lower(slug) = 'immigration';

do $$
begin
  if exists (select 1 from public.categories where name = '移民美国' or lower(slug) = 'immigration') then
    raise exception 'legacy 移民美国 category still exists';
  end if;
  if exists (select 1 from public.articles where category_name = '移民美国') then
    raise exception 'legacy 移民美国 articles still exist';
  end if;
end;
$$;
