begin;

-- JOBS-R2 N2 extends the canonical search RPC without replacing the R1 data source.
-- The R1 signature remains available for compatibility; this overload adds ZIP filtering.
create or replace function public.search_job_listings(
  p_keyword text default null,
  p_category_slug text default null,
  p_employment_type text default null,
  p_state_code text default null,
  p_city text default null,
  p_county text default null,
  p_borough text default null,
  p_neighborhood text default null,
  p_postal_code text default null,
  p_salary_min numeric default null,
  p_sort text default 'relevance',
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_radius_miles numeric default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  description text,
  category_slug text,
  employment_type text,
  salary_min numeric,
  salary_max numeric,
  salary_period text,
  state_code text,
  city text,
  county text,
  borough text,
  neighborhood text,
  postal_code text,
  latitude numeric,
  longitude numeric,
  published_at timestamptz,
  created_at timestamptz,
  distance_miles numeric,
  relevance_score real
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select
      j.*,
      case
        when nullif(btrim(coalesce(p_keyword,'')), '') is null then 0::real
        else ts_rank(
          to_tsvector('simple', coalesce(j.title,'') || ' ' || coalesce(j.description,'')),
          plainto_tsquery('simple', btrim(p_keyword))
        )
      end as score,
      case
        when p_latitude is null or p_longitude is null or j.latitude is null or j.longitude is null then null::numeric
        else round((3958.7613 * 2 * asin(sqrt(
          power(sin(radians((j.latitude - p_latitude)::double precision) / 2), 2) +
          cos(radians(p_latitude::double precision)) * cos(radians(j.latitude::double precision)) *
          power(sin(radians((j.longitude - p_longitude)::double precision) / 2), 2)
        )))::numeric, 1)
      end as miles
    from public.job_listings j
    where j.country_code='US'
      and j.status='open'
      and (nullif(btrim(coalesce(p_keyword,'')), '') is null or
           to_tsvector('simple', coalesce(j.title,'') || ' ' || coalesce(j.description,'')) @@ plainto_tsquery('simple', btrim(p_keyword)) or
           j.title ilike '%' || btrim(p_keyword) || '%' or
           j.description ilike '%' || btrim(p_keyword) || '%')
      and (p_category_slug is null or p_category_slug='' or j.category_slug=p_category_slug)
      and (p_employment_type is null or p_employment_type='' or j.employment_type=p_employment_type)
      and (p_state_code is null or p_state_code='' or upper(j.state_code)=upper(p_state_code))
      and (p_city is null or p_city='' or lower(j.city)=lower(p_city))
      and (p_county is null or p_county='' or lower(coalesce(j.county,''))=lower(p_county))
      and (p_borough is null or p_borough='' or lower(coalesce(j.borough,''))=lower(p_borough))
      and (p_neighborhood is null or p_neighborhood='' or lower(coalesce(j.neighborhood,''))=lower(p_neighborhood))
      and (p_postal_code is null or p_postal_code='' or upper(coalesce(j.postal_code,''))=upper(p_postal_code))
      and (p_salary_min is null or coalesce(j.salary_max,j.salary_min,0) >= p_salary_min)
      and (
        p_radius_miles is null or p_latitude is null or p_longitude is null or
        (j.latitude is not null and j.longitude is not null and
          (3958.7613 * 2 * asin(sqrt(
            power(sin(radians((j.latitude - p_latitude)::double precision) / 2), 2) +
            cos(radians(p_latitude::double precision)) * cos(radians(j.latitude::double precision)) *
            power(sin(radians((j.longitude - p_longitude)::double precision) / 2), 2)
          ))) <= p_radius_miles
        )
      )
  )
  select
    f.id,f.title,f.description,f.category_slug,f.employment_type,
    f.salary_min,f.salary_max,f.salary_period,
    f.state_code,f.city,f.county,f.borough,f.neighborhood,f.postal_code,
    f.latitude,f.longitude,f.published_at,f.created_at,
    f.miles as distance_miles,f.score as relevance_score
  from filtered f
  order by
    case when p_sort='distance' then f.miles end asc nulls last,
    case when p_sort='latest' then coalesce(f.published_at,f.created_at) end desc nulls last,
    case when p_sort='salary' then coalesce(f.salary_max,f.salary_min) end desc nulls last,
    case when p_sort='relevance' then f.score end desc nulls last,
    coalesce(f.published_at,f.created_at) desc,
    f.id
  limit greatest(1, least(coalesce(p_limit,50),100))
  offset greatest(0, coalesce(p_offset,0));
$$;

grant execute on function public.search_job_listings(text,text,text,text,text,text,text,text,text,numeric,text,numeric,numeric,numeric,integer,integer) to anon, authenticated;

comment on function public.search_job_listings(text,text,text,text,text,text,text,text,text,numeric,text,numeric,numeric,numeric,integer,integer) is
  'JOBS-R2 canonical US-only search overload: supports optional ZIP plus exact 5/10/25/50-mile radius when explicit coordinates exist.';

commit;
