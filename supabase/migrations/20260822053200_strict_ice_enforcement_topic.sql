-- Strict ICE topic assignment: explicit ICE agency + concrete enforcement action.
-- General immigration procedure, USCIS, BIA, DHS, CBP, ERO or HSI references alone are not ICE enforcement.

create or replace function public.assign_article_category_from_topic()
returns trigger
language plpgsql
as $$
declare
  target record;
  article_text text;
  explicit_ice_agency boolean;
  explicit_enforcement_action boolean;
  ice_match boolean;
  has_primary_non_ice_category boolean;
begin
  article_text := coalesce(new.title, '') || ' ' || coalesce(new.summary, '') || ' ' || coalesce(new.content, '');

  if article_text ~* '(特朗普|川普|Donald[[:space:]]+Trump|President[[:space:]]+Trump)' then
    new.topic_key := 'trump';
  end if;

  explicit_ice_agency := article_text ~* '(\mICE\M|U[.]S[.][[:space:]]+Immigration[[:space:]]+and[[:space:]]+Customs[[:space:]]+Enforcement|Immigration[[:space:]]+and[[:space:]]+Customs[[:space:]]+Enforcement|移民及海关执法局|移民与海关执法局|移民和海关执法局|美国移民海关执法局|美国移民与海关执法局)';
  explicit_enforcement_action := article_text ~* '(抓捕|抓获|拘捕|逮捕|拘留|拘押|羁押|遣返|递解|驱逐出境|强制离境|突袭|搜捕|通缉|扫荡|执法行动|拘留令|扣押令|\marrest(s|ed|ing)?\M|\mdetain(s|ed|ing)?\M|\mdetention\M|\mdeport(s|ed|ing|ation)?\M|\mremoval\M|\mraid(s|ed|ing)?\M|\mcustody\M|\mfugitive\M|\mwarrant\M)';
  ice_match := explicit_ice_agency and explicit_enforcement_action;

  has_primary_non_ice_category :=
       coalesce(btrim(new.category_name), '') <> ''
    and new.category_name not in (
      '新闻','未分类','驱逐快报','驱逐新闻','ICE动态','ICE','ICE执法','ICE执法动态','ICE执法追踪','ICE新闻'
    );

  if ice_match then
    new.topic_key := 'ice';

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
  elsif lower(coalesce(new.topic_key, '')) = 'ice' then
    new.topic_key := null;
  end if;

  return new;
end;
$$;

drop trigger if exists articles_assign_category_from_topic on public.articles;
create trigger articles_assign_category_from_topic
before insert or update of topic_key, slug, title, summary, content, category_id, category_name on public.articles
for each row execute function public.assign_article_category_from_topic();

-- Remove every legacy ICE topic that does not pass the new two-signal rule.
update public.articles
set topic_key = null
where lower(coalesce(topic_key, '')) = 'ice'
  and not (
    (coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, ''))
      ~* '(\mICE\M|U[.]S[.][[:space:]]+Immigration[[:space:]]+and[[:space:]]+Customs[[:space:]]+Enforcement|Immigration[[:space:]]+and[[:space:]]+Customs[[:space:]]+Enforcement|移民及海关执法局|移民与海关执法局|移民和海关执法局|美国移民海关执法局|美国移民与海关执法局)'
    and
    (coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, ''))
      ~* '(抓捕|抓获|拘捕|逮捕|拘留|拘押|羁押|遣返|递解|驱逐出境|强制离境|突袭|搜捕|通缉|扫荡|执法行动|拘留令|扣押令|\marrest(s|ed|ing)?\M|\mdetain(s|ed|ing)?\M|\mdetention\M|\mdeport(s|ed|ing|ation)?\M|\mremoval\M|\mraid(s|ed|ing)?\M|\mcustody\M|\mfugitive\M|\mwarrant\M)'
  );
