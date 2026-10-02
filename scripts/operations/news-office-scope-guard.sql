
create or replace function public.news_office_title_error(value text)
returns boolean language plpgsql immutable security invoker set search_path = pg_catalog as $$
declare sentence text;
begin
  foreach sentence in array regexp_split_to_array(coalesce(value,''), E'[。！？!?\\n]') loop
    if sentence ~* '(?<![此之以])前[[:space:]]*(美国|美國)?[[:space:]]*(总统|總統)[[:space:]]*(唐纳德[·・[:space:]]*|唐納德[·・[:space:]]*)?(特朗普|川普)|former[[:space:]]+(US[[:space:]]+|U[.]S[.][[:space:]]+)?president[[:space:]]+(Donald[[:space:]]+)?Trump|(特朗普|川普)[[:space:]]*前(总统|總統)'
       and not (sentence ~ '202[1-4]' and sentence ~* '时任|時任|当时|當時|then[- ]') then return true; end if;
  end loop;
  return false;
end $$;

create or replace function public.enforce_news_office_and_scope()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
declare value text; event_at timestamptz;
begin
  if new.status <> 'published' then return new; end if;
  event_at := coalesce(new.published_at, now());
  if event_at >= '2025-01-20 17:00:00+00' and event_at < '2029-01-20 17:00:00+00' then
    if public.news_office_title_error(new.title) or public.news_office_title_error(new.summary)
       or public.news_office_title_error(new.content) or public.news_office_title_error(new.seo_title) then
      raise exception using errcode='23514', message='人物任职称谓错误：当前任期特朗普不得称前总统。历史语境须明确2021至2024年日期及当时身份。';
    end if;
  end if;
  value := concat_ws(' ',new.title,new.summary,new.content);
  if value ~* 'Russia|Russian|Moscow|Sochi|Kremlin|United Kingdom|British|France|French|Germany|German|India|Indian|Brazil|South Africa|俄罗斯|俄羅斯|俄国|俄國|莫斯科|索契|克里姆林|英国|英國|法国|法國|德国|德國|印度|巴西|南非'
     and value !~* '\m(U[.]?S[.]?|United States|American|White House|ICE|ERO|HSI|DHS|CBP|USCIS|FBI|DOJ|IRS|Trump|Biden|China|Chinese|Beijing|New York|California|Los Angeles|San Francisco|Texas|Florida)\M|美国|美國|美方|白宫|白宮|特朗普|川普|拜登|纽约|紐約|加州|洛杉矶|洛杉磯|旧金山|舊金山|德州|佛罗里达|佛羅里達|中国|中國|中共|习近平|習近平|中美|中俄|美俄' then
    raise exception using errcode='23514', message='采编范围不符：第三国国内事件须有可核实的中国或美国实际关联，不得因最高法院、总统、警方等泛称自动归入美国新闻。';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_news_office_and_scope() from public, anon, authenticated;
grant execute on function public.news_office_title_error(text) to service_role;
create trigger enforce_news_office_and_scope
before insert or update of title,summary,content,seo_title,status,published_at on public.articles
for each row execute function public.enforce_news_office_and_scope();

