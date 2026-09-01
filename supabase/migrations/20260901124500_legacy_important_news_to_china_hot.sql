-- The retired `重要新闻` label still exists on 400 migrated legacy articles.
-- Editorial review on 2026-09-01 found that all 400 have complete bodies (at
-- least 180 characters), so preserve the historical text verbatim and only
-- normalize their category and canonical route to 中国热门头条.

do $migration$
declare
  target record;
  candidate_count integer;
  migrated_count integer;
  invalid_count integer;
  changed_count integer;
begin
  select id, name, slug into target
  from public.categories
  where is_active = true
    and (lower(coalesce(slug, '')) = 'hot-headlines' or name in ('热门头条', '中国热门头条'))
  order by
    case when lower(coalesce(slug, '')) = 'hot-headlines' then 0 else 1 end,
    case when name = '热门头条' then 0 else 1 end
  limit 1;

  if target.id is null or target.slug <> 'hot-headlines' then
    raise exception 'Active 中国热门头条 category was not found';
  end if;

  select count(*) into candidate_count
  from public.articles
  where legacy_id is not null
    and category_name = '重要新闻';

  select count(*) into migrated_count
  from public.articles
  where metadata->>'legacy_category_cleanup_batch' = '20260901-important-news-to-china-hot';

  -- Idempotent reruns are allowed only after the exact reviewed set completed.
  if candidate_count = 0 then
    if migrated_count <> 400 then
      raise exception 'No candidates remain, but migration ledger has % rows instead of 400', migrated_count;
    end if;
    return;
  end if;

  if candidate_count <> 400 then
    raise exception 'Expected exactly 400 legacy 重要新闻 rows, found %', candidate_count;
  end if;

  select count(*) into invalid_count
  from public.articles
  where legacy_id is not null
    and category_name = '重要新闻'
    and (
      nullif(trim(coalesce(title, '')), '') is null
      or length(regexp_replace(coalesce(content, ''), '<[^>]+>|\s+', '', 'g')) < 180
      or nullif(trim(coalesce(slug, '')), '') is null
      or canonical_url !~ '^https://trrb\.net/(important-news|hot-headlines)/'
    );

  if invalid_count <> 0 then
    raise exception '% reviewed rows no longer satisfy the no-AI-expansion migration contract', invalid_count;
  end if;

  update public.articles
  set category_id = target.id,
      category_name = target.name,
      primary_section = target.slug,
      topic_key = null,
      canonical_url = replace(canonical_url, '/important-news/', '/hot-headlines/'),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'human_category_override', '中国热门头条',
        'human_category_override_updated_at', now(),
        'legacy_previous_category_name', category_name,
        'legacy_previous_primary_section', primary_section,
        'legacy_previous_canonical_url', canonical_url,
        'legacy_category_cleanup_batch', '20260901-important-news-to-china-hot',
        'legacy_ai_expansion', false,
        'legacy_ai_expansion_reason', 'original-body-complete-preserved-verbatim'
      ),
      updated_at = now()
  where legacy_id is not null
    and category_name = '重要新闻';

  get diagnostics changed_count = row_count;
  if changed_count <> 400 then
    raise exception 'Expected to update 400 rows, updated %', changed_count;
  end if;

  select count(*) into invalid_count
  from public.articles
  where metadata->>'legacy_category_cleanup_batch' = '20260901-important-news-to-china-hot'
    and (
      category_id is distinct from target.id
      or category_name is distinct from target.name
      or primary_section is distinct from 'hot-headlines'
      or canonical_url !~ '^https://trrb\.net/hot-headlines/'
    );

  if invalid_count <> 0 then
    raise exception '% migrated rows failed the 中国热门头条 postcondition', invalid_count;
  end if;
end;
$migration$;
