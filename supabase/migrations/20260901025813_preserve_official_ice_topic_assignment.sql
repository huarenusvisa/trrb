-- Preserve the explicit ICE assignment made by the official-source publisher.
-- The strict text classifier still protects ordinary articles, while trusted
-- official ICE records no longer lose topic_key when a concise Chinese headline
-- omits the literal agency name.

do $migration$
declare
  function_def text;
  original_line constant text := 'ice_match := explicit_ice_agency and explicit_enforcement_action;';
  replacement_line constant text := $line$ice_match := (explicit_ice_agency and explicit_enforcement_action)
    or (
      lower(coalesce(new.topic_key, '')) = 'ice'
      and new.category_name in (
        '驱逐快报','驱逐新闻','ICE动态','ICE','ICE执法','ICE执法动态','ICE执法追踪','ICE新闻'
      )
      and coalesce(new.metadata->>'official_source_auto', 'false') = 'true'
    );$line$;
begin
  select pg_get_functiondef('public.assign_article_category_from_topic()'::regprocedure)
    into function_def;

  if position(original_line in function_def) = 0 then
    raise exception 'Expected ICE classifier assignment was not found';
  end if;

  function_def := replace(function_def, original_line, replacement_line);
  execute function_def;
end;
$migration$;

update public.articles
set topic_key = 'ice',
    updated_at = now()
where topic_key is null
  and category_name in (
    '驱逐快报','驱逐新闻','ICE动态','ICE','ICE执法','ICE执法动态','ICE执法追踪','ICE新闻'
  )
  and coalesce(metadata->>'official_source_auto', 'false') = 'true';
