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
    'ICE执法动态', '美国时政', '美国警情', '移民美国', '中国热门头条'
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
    where is_active = true and name = approved_category
    order by id
    limit 1;
  end if;

  if target.id is null then
    raise exception 'Active category not found for human override: %', approved_category;
  end if;

  new.category_id := target.id;
  new.category_name := target.name;
  new.primary_section := target.slug;
  new.topic_key := case when approved_category = 'ICE执法动态' then 'ice' else null end;
  return new;
end;
$function$;


create temporary table asylum_distribution (
 legacy_id text primary key, path text, topic text, category_name text
) on commit drop;
insert into asylum_distribution values
('wp-113915','change-status','i485','移民美国·境内身份转换·I-485境内调整身份·历史知识文章'),
('wp-113749','change-status','i485','移民美国·境内身份转换·I-485境内调整身份·历史知识文章'),
('wp-113730','change-status','i485','移民美国·境内身份转换·I-485境内调整身份·历史知识文章'),
('wp-113721','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-113726','humanitarian','asylum','移民美国·人道主义庇护·政治庇护·历史知识文章'),
('wp-113718','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-113700','change-status','ead','移民美国·境内身份转换·EAD工卡·历史知识文章'),
('wp-113707','humanitarian','c08-ead','移民美国·人道主义庇护·C08庇护工卡·历史知识文章'),
('wp-113597','change-status','ead','移民美国·境内身份转换·EAD工卡·历史知识文章'),
('wp-113518','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-113433','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-113287','humanitarian','c08-ead','移民美国·人道主义庇护·C08庇护工卡·历史知识文章'),
('wp-113266','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-113263','humanitarian','asylum-family','移民美国·人道主义庇护·庇护家属与I-730·历史知识文章'),
('wp-113179','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-113176','humanitarian','asylum-status','移民美国·人道主义庇护·庇护身份与生活·历史知识文章'),
('wp-112997','humanitarian','asylum','移民美国·人道主义庇护·政治庇护·历史知识文章'),
('wp-112919','change-status','b2-to-f1','移民美国·境内身份转换·B-2转F-1·历史知识文章'),
('wp-112994','humanitarian','asylum-status','移民美国·人道主义庇护·庇护身份与生活·历史知识文章'),
('wp-112982','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-112978','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-112960','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-112742','humanitarian','asylum','移民美国·人道主义庇护·政治庇护·历史知识文章'),
('wp-112721','humanitarian','asylum','移民美国·人道主义庇护·政治庇护·历史知识文章'),
('wp-112734','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-112731','humanitarian','asylum','移民美国·人道主义庇护·政治庇护·历史知识文章'),
('wp-112700','humanitarian','asylum','移民美国·人道主义庇护·政治庇护·历史知识文章'),
('wp-112714','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-112706','humanitarian','asylum-status','移民美国·人道主义庇护·庇护身份与生活·历史知识文章'),
('wp-112683','humanitarian','asylum-status','移民美国·人道主义庇护·庇护身份与生活·历史知识文章'),
('wp-112457','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-112337','change-status','advance-parole','移民美国·境内身份转换·Advance Parole旅行许可·历史知识文章'),
('wp-112327','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-112248','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-112112','change-status','i485','移民美国·境内身份转换·I-485境内调整身份·历史知识文章'),
('wp-112231','change-status','i485','移民美国·境内身份转换·I-485境内调整身份·历史知识文章'),
('wp-112235','change-status','i485','移民美国·境内身份转换·I-485境内调整身份·历史知识文章'),
('wp-112225','change-status','i485','移民美国·境内身份转换·I-485境内调整身份·历史知识文章'),
('wp-112110','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-112047','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-111901','change-status','i485','移民美国·境内身份转换·I-485境内调整身份·历史知识文章'),
('wp-111898','family','parents','移民美国·家庭移民·父母移民·历史知识文章'),
('wp-111883','change-status','i485','移民美国·境内身份转换·I-485境内调整身份·历史知识文章'),
('wp-111842','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-111809','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-111806','humanitarian','asylum-family','移民美国·人道主义庇护·庇护家属与I-730·历史知识文章'),
('wp-111819','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-111539','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-111552','humanitarian','vawa','移民美国·人道主义庇护·VAWA家暴保护·历史知识文章'),
('wp-111528','humanitarian','sijs','移民美国·人道主义庇护·SIJS特殊青少年·历史知识文章'),
('wp-111533','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-111515','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-111516','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-111507','change-status','i485','移民美国·境内身份转换·I-485境内调整身份·历史知识文章'),
('wp-111499','change-status','uscis-policy','移民美国·境内身份转换·USCIS政策与表格·历史知识文章'),
('wp-111357','change-status','i485','移民美国·境内身份转换·I-485境内调整身份·历史知识文章'),
('wp-111351',null,'iceandpolice','ICE执法与警情'),
('wp-111335','change-status','i485','移民美国·境内身份转换·I-485境内调整身份·历史知识文章'),
('wp-111302','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-111289','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-111169','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-111105','humanitarian','asylum-family','移民美国·人道主义庇护·庇护家属与I-730·历史知识文章'),
('wp-111109','humanitarian','refugee','移民美国·人道主义庇护·难民安置·历史知识文章'),
('wp-111103','humanitarian','refugee','移民美国·人道主义庇护·难民安置·历史知识文章'),
('wp-111058','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-111060','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-110955','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-110967','humanitarian','asylum','移民美国·人道主义庇护·政治庇护·历史知识文章'),
('wp-110964','humanitarian','asylum-status','移民美国·人道主义庇护·庇护身份与生活·历史知识文章'),
('wp-110961','humanitarian','asylum-status','移民美国·人道主义庇护·庇护身份与生活·历史知识文章'),
('wp-110954','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-110945','family','citizen-spouse','移民美国·家庭移民·美国公民婚姻绿卡·历史知识文章'),
('wp-110938','humanitarian','asylum-status','移民美国·人道主义庇护·庇护身份与生活·历史知识文章'),
('wp-110918','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-110905','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-110646','humanitarian','c08-ead','移民美国·人道主义庇护·C08庇护工卡·历史知识文章'),
('wp-110614','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-110568','humanitarian','immigration-court','移民美国·人道主义庇护·移民法庭与保释·历史知识文章'),
('wp-110544','humanitarian','asylum-status','移民美国·人道主义庇护·庇护身份与生活·历史知识文章'),
('wp-110558','humanitarian','asylum-family','移民美国·人道主义庇护·庇护家属与I-730·历史知识文章'),
('wp-110554','humanitarian','asylum-status','移民美国·人道主义庇护·庇护身份与生活·历史知识文章'),
('wp-110551','change-status','i485','移民美国·境内身份转换·I-485境内调整身份·历史知识文章'),
('wp-110385','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-110284','humanitarian','asylum-family','移民美国·人道主义庇护·庇护家属与I-730·历史知识文章'),
('wp-110265','humanitarian','asylum','移民美国·人道主义庇护·政治庇护·历史知识文章'),
('wp-110212','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-110207','humanitarian','asylum-status','移民美国·人道主义庇护·庇护身份与生活·历史知识文章'),
('wp-110193','humanitarian','asylum','移民美国·人道主义庇护·政治庇护·历史知识文章'),
('wp-110063','humanitarian','asylum','移民美国·人道主义庇护·政治庇护·历史知识文章'),
('wp-110184','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-110116','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-109900','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-109896','change-status','ead','移民美国·境内身份转换·EAD工卡·历史知识文章'),
('wp-109893','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-109890','change-status','advance-parole','移民美国·境内身份转换·Advance Parole旅行许可·历史知识文章'),
('wp-109887','humanitarian','c08-ead','移民美国·人道主义庇护·C08庇护工卡·历史知识文章'),
('wp-109770','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-109763','change-status','uscis-policy','移民美国·境内身份转换·USCIS政策与表格·历史知识文章'),
('wp-109753','humanitarian','asylum','移民美国·人道主义庇护·政治庇护·历史知识文章'),
('wp-107922',null,'iceandpolice','ICE执法与警情'),
('wp-107508',null,'iceandpolice','ICE执法与警情'),
('wp-107046',null,'iceandpolice','ICE执法与警情'),
('wp-106884','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-106877','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-104682','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-104627',null,'iceandpolice','ICE执法与警情'),
('wp-104612',null,'iceandpolice','ICE执法与警情'),
('wp-104542','humanitarian','c08-ead','移民美国·人道主义庇护·C08庇护工卡·历史知识文章'),
('wp-104149',null,'iceandpolice','ICE执法与警情'),
('wp-102446','family','citizen-spouse','移民美国·家庭移民·美国公民婚姻绿卡·历史知识文章'),
('wp-102331',null,'iceandpolice','ICE执法与警情'),
('wp-101267','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-101264','humanitarian','c08-ead','移民美国·人道主义庇护·C08庇护工卡·历史知识文章'),
('wp-101262','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-101260','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-101258','humanitarian','asylum','移民美国·人道主义庇护·政治庇护·历史知识文章'),
('wp-101255','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-101253','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-101250','humanitarian','asylum','移民美国·人道主义庇护·政治庇护·历史知识文章'),
('wp-101246','humanitarian','c08-ead','移民美国·人道主义庇护·C08庇护工卡·历史知识文章'),
('wp-101243','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-101240','humanitarian','asylum-process','移民美国·人道主义庇护·庇护申请与面谈·历史知识文章'),
('wp-101237','humanitarian','asylum-status','移民美国·人道主义庇护·庇护身份与生活·历史知识文章'),
('wp-99200',null,'iceandpolice','ICE执法与警情');

create temporary table asylum_distribution_before on commit drop as
select a.* from public.articles a join asylum_distribution d
on coalesce(a.metadata->>'archive_id',a.legacy_id)=d.legacy_id;

do $$
begin
  if (select count(*) from asylum_distribution_before) <> 124 then
    raise exception 'Expected all 124 existing archived articles; aborting';
  end if;
end $$;

update public.articles a
set category_name=d.category_name,
    metadata=(coalesce(a.metadata,'{}'::jsonb)-'human_category_override')
      || jsonb_build_object(
        'legacy_category','庇护百科',
        'knowledge_path',d.path,
        'knowledge_topic',case when d.path is null then null else d.topic end,
        'knowledge_subcategory',case when d.path is null then null else d.topic end,
        'knowledge_migration_batch','20260923-asylum-knowledge',
        'human_category_override',d.category_name,
        'knowledge_distribution_previous',coalesce(a.metadata->'knowledge_distribution_previous',
          jsonb_build_object('category_name',a.category_name,'category_id',a.category_id,
            'primary_section',a.primary_section,'topic_key',a.topic_key,'canonical_url',a.canonical_url,
            'knowledge_path',a.metadata->'knowledge_path','knowledge_topic',a.metadata->'knowledge_topic',
            'human_category_override',a.metadata->'human_category_override')),
        'knowledge_distribution_at','2026-09-23'
      )
from asylum_distribution d
where coalesce(a.metadata->>'archive_id',a.legacy_id)=d.legacy_id;

do $$
begin
  if exists(select 1 from public.articles a join asylum_distribution_before b using(id)
    where (a.title,a.summary,a.content,a.slug,a.status,a.visibility,a.published_at,a.created_at,a.cover_image)
       is distinct from
          (b.title,b.summary,b.content,b.slug,b.status,b.visibility,b.published_at,b.created_at,b.cover_image)) then
    raise exception 'Article content or publication changed; rolling back';
  end if;
  if exists(select 1 from public.articles a join asylum_distribution d
    on coalesce(a.metadata->>'archive_id',a.legacy_id)=d.legacy_id
    where a.category_name<>d.category_name or a.metadata->>'knowledge_path' is distinct from d.path
       or (d.path is not null and a.topic_key is not null)) then
    raise exception 'A category trigger overrode reviewed placement; rolling back';
  end if;
end $$;

-- The original archive only retains an opening and closing paragraph.
-- Preserve it as a private draft, without inventing the missing body.
insert into public.articles (legacy_id,title,slug,summary,content,category_name,status,visibility,
 author,created_at,metadata)
select 'wp-110547',
 '美国绿卡获取方式一览：亲属、职业、庇护、抽签和特殊类别怎么选',
 'legacy-green-card-pathways-wp110547',
 '原始归档只剩开头与结尾，正文尚待补齐。',
 '在美国，获取绿卡（永久居民身份）主要有几种方式，每种方式针对不同的申请人群体：'
 || chr(10)||chr(10) ||
 '掌握自身类别和路径，合理选择调整身份或领事处理，是成功获得美国绿卡的关键。无论是亲属、就业、庇护还是抽签，每条路径都有特定要求与注意事项，建议申请人提前规划，以提高成功率。',
 '移民美国·境内身份转换·I-485境内调整身份·历史知识文章','draft','private',
 'Tang Ren Daily','2026-06-03T15:20:00-04:00',
 jsonb_build_object('archive_id','wp-110547','legacy_category','庇护百科',
   'migration_source','github-static-archive','archive_file','articles-chunk-20.js',
   'archive_date','2026-06-03','knowledge_path','change-status','knowledge_topic','i485',
   'knowledge_subcategory','i485','knowledge_migration_batch','20260923-asylum-knowledge',
   'human_category_override','移民美国·境内身份转换·I-485境内调整身份·历史知识文章',
   'editorial_review_required','original-body-incomplete')
where not exists(select 1 from public.articles where legacy_id='wp-110547' or metadata->>'archive_id'='wp-110547');

commit;
