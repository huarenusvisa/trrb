-- Keep "移民美国" limited to immigration-to-the-United-States content.
-- ICE enforcement is always routed to the dedicated ICE category, including manual immediate publishing.

create or replace function public.assign_article_category_from_topic()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target record;
  article_text text;
  immigration_text text;
  explicit_ice_agency boolean;
  explicit_enforcement_action boolean;
  ice_match boolean;
  us_immigration_match boolean;
  non_process_event boolean;
  has_primary_non_ice_category boolean;
begin
  article_text := coalesce(new.title, '') || ' ' || coalesce(new.summary, '');
  immigration_text := article_text || ' ' || left(coalesce(new.content, ''), 1200);

  if article_text ~* '(特朗普|川普|Donald[[:space:]]+Trump|President[[:space:]]+Trump)' then
    new.topic_key := 'trump';
  end if;

  -- ASCII-only boundaries recognize "ICE执法" while refusing substrings such as service/practice/notice.
  explicit_ice_agency := article_text ~* '(^|[^A-Za-z])ICE([^A-Za-z]|$|执法|拘|抓|逮|遣|驱|突|搜)'
    or article_text ~* '(U[.]S[.][[:space:]]+Immigration[[:space:]]+and[[:space:]]+Customs[[:space:]]+Enforcement|Immigration[[:space:]]+and[[:space:]]+Customs[[:space:]]+Enforcement|移民及海关执法局|移民与海关执法局|移民和海关执法局|美国移民海关执法局|美国移民与海关执法局)';
  explicit_enforcement_action := article_text ~* '(抓捕|抓获|拘捕|逮捕|拘留|拘押|羁押|遣返|递解|驱逐出境|强制离境|突袭|搜捕|通缉|扫荡|执法行动|查获|扩大执法|拘留令|扣押令|arrest|detain|detention|deport|deportation|removal|raid|custody|fugitive|warrant)';
  ice_match := explicit_ice_agency and explicit_enforcement_action;

  non_process_event := immigration_text ~* '(抓捕|抓获|拘捕|逮捕|被捕|拘留|拘押|羁押|查获|突袭|搜捕|破获|起诉|遣返|递解|驱逐|强制离境|诈骗案|欺诈案|性侵|杀害|谋杀|犯罪者|犯罪飙升|警方|执法部门|拒配合ICE|举报移民欺诈|追责提交虚假)';

  us_immigration_match := immigration_text ~* '(美国|赴美|入境美国|移民美国|美国移民|美国签证|美签|USCIS|美国公民及移民服务局|EOIR|(^|[^A-Za-z])BIA([^A-Za-z]|$)|移民上诉委员会|Matter[[:space:]]+of|绿卡|永久居民|入籍|归化|调整身份|身份调整|工卡|(^|[^A-Za-z])EAD([^A-Za-z]|$)|Advance[[:space:]]+Parole|回美证|再入境许可|移民法庭|移民法官|移民签证|签证公告|排期|(^|[^A-Za-z])NVC([^A-Za-z]|$)|领事馆面签|DACA|(^|[^A-Za-z])TPS([^A-Za-z]|$)|临时保护身份|I-?(130|140|485|589|765|864|20)|DS-?260|N-?(400|600)|SEVIS|(^|[^A-Za-z])CPT([^A-Za-z]|$)|STEM[[:space:]]+OPT|H-?1B|L-?1|O-?1|H-?2A|H-?2B|TN签证|E-?[12]|R-?1|EB-?[1-5]|NIW|PERM|F-?1|J-?1|M-?1|K-?1|CR-?1|IR-?1|F2A|婚姻绿卡|政治庇护|庇护申请|庇护面谈|庇护时钟|VAWA|U签证|T签证|SIJS)';

  has_primary_non_ice_category :=
       coalesce(btrim(new.category_name), '') <> ''
    and new.category_name not in (
      '新闻','未分类','驱逐快报','驱逐新闻','ICE动态','ICE','ICE执法','ICE执法动态','ICE执法追踪','ICE新闻'
    );

  if ice_match then
    new.topic_key := 'ice';

    -- "移民美国" is never a protected editorial category for ICE enforcement.
    if not has_primary_non_ice_category or new.category_name = '移民美国' then
      select id, name into target
      from public.categories
      where lower(slug) = 'ice'
      limit 1;

      if target.id is not null then
        new.category_id := target.id;
        new.category_name := target.name;
      end if;
    end if;
  elsif lower(coalesce(new.topic_key, '')) = 'ice' then
    new.topic_key := null;
  end if;

  if new.category_name = '移民美国'
     and lower(coalesce(new.status, '')) = 'published'
     and (not us_immigration_match or non_process_event) then
    raise exception using
      errcode = '23514',
      message = '“移民美国”只允许发布移民到美国的签证、绿卡、入籍、庇护申请、留学/工作移民及身份办理内容';
  end if;

  return new;
end;
$$;

drop trigger if exists articles_assign_category_from_topic on public.articles;
create trigger articles_assign_category_from_topic
before insert or update of topic_key, slug, title, summary, content, category_id, category_name, status on public.articles
for each row execute function public.assign_article_category_from_topic();

-- Repair existing ICE articles incorrectly written by the legacy immediate-publish endpoint.
update public.articles a
set category_id = c.id,
    category_name = c.name,
    topic_key = 'ice',
    updated_at = now()
from public.categories c
where lower(c.slug) = 'ice'
  and a.category_name = '移民美国'
  and (
    (coalesce(a.title, '') || ' ' || coalesce(a.summary, ''))
      ~* '(^|[^A-Za-z])ICE([^A-Za-z]|$|执法|拘|抓|逮|遣|驱|突|搜)'
    or
    (coalesce(a.title, '') || ' ' || coalesce(a.summary, ''))
      ~* '(U[.]S[.][[:space:]]+Immigration[[:space:]]+and[[:space:]]+Customs[[:space:]]+Enforcement|Immigration[[:space:]]+and[[:space:]]+Customs[[:space:]]+Enforcement|移民及海关执法局|移民与海关执法局|移民和海关执法局|美国移民海关执法局|美国移民与海关执法局)'
  )
  and (coalesce(a.title, '') || ' ' || coalesce(a.summary, ''))
      ~* '(抓捕|抓获|拘捕|逮捕|拘留|拘押|羁押|遣返|递解|驱逐出境|强制离境|突袭|搜捕|通缉|扫荡|执法行动|查获|扩大执法|拘留令|扣押令|arrest|detain|detention|deport|deportation|removal|raid|custody|fugitive|warrant)';
