begin;

-- JOBS-R2 N3: live counts over the same canonical open job_listings data.
create or replace function public.job_region_counts(
  p_category_slug text default null,
  p_limit integer default 20
)
returns table (
  state_code text,
  job_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select upper(j.state_code) as state_code, count(*)::bigint as job_count
  from public.job_listings j
  where j.country_code='US'
    and j.status='open'
    and (p_category_slug is null or p_category_slug='' or j.category_slug=p_category_slug)
  group by upper(j.state_code)
  order by job_count desc, state_code asc
  limit greatest(1, least(coalesce(p_limit,20),50));
$$;

grant execute on function public.job_region_counts(text,integer) to anon, authenticated;

create or replace function public.job_category_counts(
  p_state_code text default null,
  p_city text default null,
  p_borough text default null,
  p_neighborhood text default null,
  p_limit integer default 20
)
returns table (
  category_slug text,
  label_zh text,
  job_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select j.category_slug, c.label_zh, count(*)::bigint as job_count
  from public.job_listings j
  join public.job_categories c on c.slug=j.category_slug and c.is_active=true
  where j.country_code='US'
    and j.status='open'
    and (p_state_code is null or p_state_code='' or upper(j.state_code)=upper(p_state_code))
    and (p_city is null or p_city='' or lower(j.city)=lower(p_city))
    and (p_borough is null or p_borough='' or lower(coalesce(j.borough,''))=lower(p_borough))
    and (p_neighborhood is null or p_neighborhood='' or lower(coalesce(j.neighborhood,''))=lower(p_neighborhood))
  group by j.category_slug,c.label_zh
  order by job_count desc,c.label_zh asc
  limit greatest(1, least(coalesce(p_limit,20),50));
$$;

grant execute on function public.job_category_counts(text,text,text,text,integer) to anon, authenticated;

comment on function public.job_region_counts(text,integer) is
  'JOBS-R2 N3 live open-job counts by state after a user selects a job category.';
comment on function public.job_category_counts(text,text,text,text,integer) is
  'JOBS-R2 N3 live open-job category counts after a user selects an area.';

commit;
