-- Final editorial closure for the 59 legacy rows with conflicting category
-- metadata and the 15 same-title rows whose old IDs were never bound.
-- Preserve title, summary and content verbatim. Only bind the legacy IDs and
-- normalize category/canonical data to 中国热门头条.

do $migration$
declare
  batch_key constant text := '20260901-remaining-legacy-to-china-hot';
  target record;
  mismatch_ids text[] := array[
    'wp-103893','wp-104497','wp-105014','wp-105047','wp-105264','wp-105300','wp-105371','wp-105378',
    'wp-105655','wp-105689','wp-105693','wp-105863','wp-105928','wp-105959','wp-106049','wp-106310',
    'wp-106367','wp-106476','wp-106527','wp-106536','wp-106596','wp-106742','wp-106810','wp-106997',
    'wp-107030','wp-107197','wp-107291','wp-107465','wp-107497','wp-107503','wp-107593','wp-107610',
    'wp-107637','wp-107639','wp-107855','wp-107890','wp-107918','wp-110729','wp-111809','wp-111842',
    'wp-111901','wp-112047','wp-112110','wp-112112','wp-112327','wp-112683','wp-112978','wp-112982',
    'wp-112994','wp-113025','wp-113119','wp-113433','wp-113518','wp-113721','wp-113726','wp-113915',
    'wp-116200','wp-117046','wp-117050'
  ];
  orphan_legacy_ids text[] := array[
    'wp-117169','wp-116721','wp-116630','wp-116576','wp-116413','wp-116193','wp-115785'
  ];
  alias_legacy_ids text[] := array[
    'wp-113106','wp-110473','wp-110324','wp-101429','wp-97343','wp-94620','wp-94546','wp-93238'
  ];
  batch_count integer;
  selected_count integer;
  invalid_count integer;
  coverage_count integer;
  changed_count integer;
begin
  if array_length(mismatch_ids, 1) <> 59
     or array_length(orphan_legacy_ids, 1) <> 7
     or array_length(alias_legacy_ids, 1) <> 8 then
    raise exception 'Reviewed legacy batch cardinality changed';
  end if;

  select id, name, slug into target
  from public.categories
  where is_active = true
    and (lower(coalesce(slug, '')) = 'hot-headlines' or name in ('热门头条', '中国热门头条'))
  order by
    case when lower(coalesce(slug, '')) = 'hot-headlines' then 0 else 1 end,
    case when name = '中国热门头条' then 0 else 1 end
  limit 1;

  if target.id is null or target.slug <> 'hot-headlines' then
    raise exception 'Active 中国热门头条 category was not found';
  end if;

  select count(*) into batch_count
  from public.articles
  where metadata->>'legacy_category_cleanup_batch' = batch_key;

  if batch_count = 74 then
    select count(*) into invalid_count
    from public.articles
    where metadata->>'legacy_category_cleanup_batch' = batch_key
      and (
        category_id is distinct from target.id
        or category_name is distinct from target.name
        or primary_section is distinct from 'hot-headlines'
        or canonical_url !~ '^https://trrb\.net/hot-headlines/'
      );
    if invalid_count <> 0 then
      raise exception '% previously migrated rows failed the 中国热门头条 postcondition', invalid_count;
    end if;
    return;
  elsif batch_count <> 0 then
    raise exception 'Partial prior migration detected: % of 74 rows', batch_count;
  end if;

  select count(*) into selected_count
  from public.articles
  where legacy_id = any(mismatch_ids);
  if selected_count <> 59 then
    raise exception 'Expected 59 category-conflict rows, found %', selected_count;
  end if;

  select count(*) into selected_count
  from public.articles
  where id = any(array[
    'f1a3b322-e376-4096-9b9d-d26d9d850f75','e22838fe-8672-467f-9615-b9bed3c4d576',
    '9ca44d6e-aa1d-4b8e-abdf-4ba6e742a233','ba60c275-e7a0-468d-8207-9a75b011353a',
    '74ccf6ae-a6da-42d0-a18a-a9b15156f450','ece81d26-b881-4fd2-9271-1f9b3a5c72db',
    '2c25a061-d61f-490d-ae2b-7ceb11652273'
  ]::uuid[]) and legacy_id is null;
  if selected_count <> 7 then
    raise exception 'Expected 7 unbound same-title rows, found %', selected_count;
  end if;

  select count(*) into selected_count
  from public.articles
  where id = any(array[
    '148afd41-62d9-4fae-ba48-26dbbe8a08cc','153b7a03-bc20-4443-aaa3-d2d7fd8a510a',
    '02370d61-51b7-45e9-8cb7-00401fe43d06','e236d8ce-66bb-4071-89f1-37affdece094',
    '83d55022-f3c4-463d-8c11-0020dac9a439','75a1e419-4413-4618-9d13-99463ba96c9a',
    '16bd2b94-f934-4902-b10e-5b9946cb6398','9bf9b1a5-8738-4615-9015-298b1a48d1a4'
  ]::uuid[]);
  if selected_count <> 8 then
    raise exception 'Expected 8 duplicate-title targets, found %', selected_count;
  end if;

  select count(*) into invalid_count
  from public.articles
  where (
      legacy_id = any(mismatch_ids)
      or id = any(array[
        'f1a3b322-e376-4096-9b9d-d26d9d850f75','e22838fe-8672-467f-9615-b9bed3c4d576',
        '9ca44d6e-aa1d-4b8e-abdf-4ba6e742a233','ba60c275-e7a0-468d-8207-9a75b011353a',
        '74ccf6ae-a6da-42d0-a18a-a9b15156f450','ece81d26-b881-4fd2-9271-1f9b3a5c72db',
        '2c25a061-d61f-490d-ae2b-7ceb11652273','148afd41-62d9-4fae-ba48-26dbbe8a08cc',
        '153b7a03-bc20-4443-aaa3-d2d7fd8a510a','02370d61-51b7-45e9-8cb7-00401fe43d06',
        'e236d8ce-66bb-4071-89f1-37affdece094','83d55022-f3c4-463d-8c11-0020dac9a439',
        '75a1e419-4413-4618-9d13-99463ba96c9a','16bd2b94-f934-4902-b10e-5b9946cb6398',
        '9bf9b1a5-8738-4615-9015-298b1a48d1a4'
      ]::uuid[])
    ) and (
      nullif(trim(coalesce(title, '')), '') is null
      or nullif(trim(coalesce(content, '')), '') is null
      or nullif(trim(coalesce(slug, '')), '') is null
    );
  if invalid_count <> 0 then
    raise exception '% reviewed rows have incomplete article identity', invalid_count;
  end if;

  update public.articles a
  set category_id = target.id,
      category_name = target.name,
      primary_section = target.slug,
      topic_key = null,
      canonical_url = regexp_replace(a.canonical_url, '^https://trrb\.net/[^/]+/', 'https://trrb.net/hot-headlines/'),
      metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object(
        'human_category_override', '中国热门头条',
        'human_category_override_updated_at', now(),
        'legacy_previous_category_name', a.category_name,
        'legacy_previous_primary_section', a.primary_section,
        'legacy_previous_canonical_url', a.canonical_url,
        'legacy_category_cleanup_batch', batch_key,
        'legacy_ai_expansion', false,
        'legacy_ai_expansion_reason', 'original-body-preserved-verbatim'
      ),
      updated_at = now()
  where a.legacy_id = any(mismatch_ids);
  get diagnostics changed_count = row_count;
  if changed_count <> 59 then raise exception 'Updated % category-conflict rows instead of 59', changed_count; end if;

  update public.articles a
  set legacy_id = map.legacy_id,
      category_id = target.id,
      category_name = target.name,
      primary_section = target.slug,
      topic_key = null,
      canonical_url = map.canonical_url,
      metadata = coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object(
        'human_category_override', '中国热门头条',
        'human_category_override_updated_at', now(),
        'legacy_previous_category_name', a.category_name,
        'legacy_previous_primary_section', a.primary_section,
        'legacy_previous_canonical_url', a.canonical_url,
        'legacy_category_cleanup_batch', batch_key,
        'legacy_ai_expansion', false,
        'legacy_ai_expansion_reason', 'original-body-preserved-verbatim'
      ),
      updated_at = now()
  from (values
    ('f1a3b322-e376-4096-9b9d-d26d9d850f75'::uuid,'wp-117169','https://trrb.net/hot-headlines/%E5%B7%A5%E5%8D%A1%E5%BA%87%E6%8A%A4%E5%B9%B4%E8%B4%B9%E5%81%B7%E5%81%B7%E6%94%B9%E9%9D%A9%E6%89%B9%E4%B8%8D%E6%89%B9%E5%B7%A5%E5%8D%A1%E7%9C%8B%E5%BF%83%E6%83%85%E4%B8%8D%E4%BA%A4%E5%BA%87%E6%8A%A4%E5%B9%B4%E8%B4%B9%E5%85%B3%E9%97%AD%E6%A1%88%E4%BB%B6-mrf4frly'),
    ('e22838fe-8672-467f-9615-b9bed3c4d576'::uuid,'wp-116721','https://trrb.net/hot-headlines/%E7%AA%83%E5%90%AC%E5%99%A8-%E5%88%BA%E7%A9%BF%E7%BA%BD%E6%A3%AE%E6%9D%83%E5%8A%9B%E6%A0%B8%E5%BF%83%E4%BA%B2%E4%BF%A1%E5%80%92%E6%88%88-fbi%E5%8A%A0%E5%B7%9E-%E5%BA%87%E6%8A%A4%E7%A5%9E%E8%AF%9D-%E8%BD%B0%E7%84%B6%E7%A0%B4%E7%A2%8E-mrf4d7ks'),
    ('9ca44d6e-aa1d-4b8e-abdf-4ba6e742a233'::uuid,'wp-116630','https://trrb.net/hot-headlines/%E6%97%A5%E6%8A%932000%E4%BA%BA%E4%BB%8D%E5%AB%8C%E4%B8%8D%E5%A4%9F%E7%89%B9%E6%9C%97%E6%99%AE%E7%A7%BB%E6%B0%91%E6%89%A7%E6%B3%95%E5%86%8D%E5%8A%A0%E7%A0%81ice%E6%88%96%E6%9D%80%E5%85%A5%E5%8A%A1%E5%B7%A5%E5%9C%BA%E6%89%80-mrf3u4lk'),
    ('ba60c275-e7a0-468d-8207-9a75b011353a'::uuid,'wp-116576','https://trrb.net/hot-headlines/%E5%85%AC%E7%84%B6%E8%BF%9D%E6%8A%97%E8%81%94%E9%82%A6%E7%A6%81%E4%BB%A4ice-%E7%BA%BD%E7%BA%A6%E7%A7%BB%E6%B0%91%E6%B3%95%E5%BA%AD%E5%91%A8%E8%BE%B9%E5%A4%A7%E8%82%86%E6%8A%93%E6%8D%95%E7%A7%BB%E6%B0%91%E8%AE%AE%E5%91%98%E6%80%92%E6%89%B9%E8%B7%B5%E8%B8%8F%E5%8F%B8%E6%B3%95%E6%9D%83%E5%A8%81-mrf4izav'),
    ('74ccf6ae-a6da-42d0-a18a-a9b15156f450'::uuid,'wp-116413','https://trrb.net/hot-headlines/%E6%97%A5%E6%8D%952000%E4%BA%BA%E7%99%BD%E5%AE%AB%E5%BC%BA%E5%88%B6%E6%91%8A%E6%B4%BEice%E6%8A%93%E6%8D%95%E9%9D%9E%E6%B3%95%E7%A7%BB%E6%B0%91%E7%BE%8E%E5%A2%83%E5%86%85%E5%86%8D%E6%AC%A1%E8%BF%8E%E6%9D%A5%E6%8A%93%E6%8D%95%E6%BD%AE-mrf4afe7'),
    ('ece81d26-b881-4fd2-9271-1f9b3a5c72db'::uuid,'wp-116193','https://trrb.net/hot-headlines/%E5%89%8D%E8%84%9A%E5%BA%87%E6%8A%A4%E8%8E%B7%E6%89%B9%E5%90%8E%E8%84%9A%E4%B8%8D%E6%83%B3%E5%8F%8D%E5%85%B1%E7%BD%91%E4%BC%A0%E6%88%AA%E5%9B%BE%E5%BC%95%E7%88%86%E5%8D%8E%E4%BA%BA%E5%9C%88%E4%BA%89%E8%AE%AE-mrf51lll'),
    ('2c25a061-d61f-490d-ae2b-7ceb11652273'::uuid,'wp-115785','https://trrb.net/hot-headlines/ice-%E8%BF%8E%E6%9D%A5%E7%A1%AC%E6%A0%B8%E6%8E%8C%E8%88%B5%E4%BA%BA%E7%89%B9%E6%9C%97%E6%99%AE%E7%A5%AD%E5%87%BA-29-%E5%B9%B4%E8%80%81%E8%AD%A6%E5%85%A8%E5%A2%83%E6%8A%93%E6%8D%95%E9%81%A3%E8%BF%94-%E8%AE%A1%E5%88%92%E5%85%A8%E9%80%9F%E6%8E%A8%E8%BF%9B-mrf40iqm')
  ) as map(article_id, legacy_id, canonical_url)
  where a.id = map.article_id;
  get diagnostics changed_count = row_count;
  if changed_count <> 7 then raise exception 'Bound % same-title rows instead of 7', changed_count; end if;

  update public.articles a
  set category_id = target.id,
      category_name = target.name,
      primary_section = target.slug,
      topic_key = null,
      canonical_url = regexp_replace(a.canonical_url, '^https://trrb\.net/[^/]+/', 'https://trrb.net/hot-headlines/'),
      metadata = (coalesce(a.metadata, '{}'::jsonb) || jsonb_build_object(
        'human_category_override', '中国热门头条',
        'human_category_override_updated_at', now(),
        'legacy_previous_category_name', a.category_name,
        'legacy_previous_primary_section', a.primary_section,
        'legacy_previous_canonical_url', a.canonical_url,
        'legacy_category_cleanup_batch', batch_key,
        'legacy_ai_expansion', false,
        'legacy_ai_expansion_reason', 'original-body-preserved-verbatim'
      )) || jsonb_build_object(
        'legacy_alias_ids', case
          when coalesce(a.metadata->'legacy_alias_ids', '[]'::jsonb) @> jsonb_build_array(map.alias_id)
            then coalesce(a.metadata->'legacy_alias_ids', '[]'::jsonb)
          else coalesce(a.metadata->'legacy_alias_ids', '[]'::jsonb) || jsonb_build_array(map.alias_id)
        end,
        'legacy_alias_updated_at', now()
      ),
      updated_at = now()
  from (values
    ('148afd41-62d9-4fae-ba48-26dbbe8a08cc'::uuid,'wp-113106'),
    ('153b7a03-bc20-4443-aaa3-d2d7fd8a510a'::uuid,'wp-110473'),
    ('02370d61-51b7-45e9-8cb7-00401fe43d06'::uuid,'wp-110324'),
    ('e236d8ce-66bb-4071-89f1-37affdece094'::uuid,'wp-101429'),
    ('83d55022-f3c4-463d-8c11-0020dac9a439'::uuid,'wp-97343'),
    ('75a1e419-4413-4618-9d13-99463ba96c9a'::uuid,'wp-94620'),
    ('16bd2b94-f934-4902-b10e-5b9946cb6398'::uuid,'wp-94546'),
    ('9bf9b1a5-8738-4615-9015-298b1a48d1a4'::uuid,'wp-93238')
  ) as map(article_id, alias_id)
  where a.id = map.article_id;
  get diagnostics changed_count = row_count;
  if changed_count <> 8 then raise exception 'Bound % duplicate-title aliases instead of 8', changed_count; end if;

  select count(*) into batch_count
  from public.articles
  where metadata->>'legacy_category_cleanup_batch' = batch_key;
  if batch_count <> 74 then raise exception 'Final batch contains % rows instead of 74', batch_count; end if;

  select count(*) into invalid_count
  from public.articles
  where metadata->>'legacy_category_cleanup_batch' = batch_key
    and (
      category_id is distinct from target.id
      or category_name is distinct from target.name
      or primary_section is distinct from 'hot-headlines'
      or canonical_url !~ '^https://trrb\.net/hot-headlines/'
    );
  if invalid_count <> 0 then raise exception '% rows failed the final 中国热门头条 postcondition', invalid_count; end if;

  with expected(legacy_id) as (
    select unnest(mismatch_ids || orphan_legacy_ids || alias_legacy_ids)
  )
  select count(*) into coverage_count
  from expected e
  where exists (
    select 1 from public.articles a
    where a.legacy_id = e.legacy_id
       or coalesce(a.metadata->'legacy_alias_ids', '[]'::jsonb) @> jsonb_build_array(e.legacy_id)
  );
  if coverage_count <> 74 then raise exception 'Only % of 74 old IDs are bound', coverage_count; end if;
end;
$migration$;
