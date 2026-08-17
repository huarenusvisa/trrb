begin;

-- Normalize the canonical location fields without creating a parallel location data source.
create or replace function public.normalize_job_listing_location()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.country_code := 'US';
  new.state_code := upper(btrim(new.state_code));
  new.city := btrim(new.city);
  new.county := nullif(btrim(coalesce(new.county,'')), '');
  new.borough := nullif(btrim(coalesce(new.borough,'')), '');
  new.neighborhood := nullif(btrim(coalesce(new.neighborhood,'')), '');
  new.postal_code := nullif(btrim(coalesce(new.postal_code,'')), '');
  if (new.latitude is null) <> (new.longitude is null) then
    raise exception 'latitude and longitude must be supplied together';
  end if;
  return new;
end;
$$;

drop trigger if exists job_listings_normalize_location on public.job_listings;
create trigger job_listings_normalize_location
before insert or update of country_code,state_code,city,county,borough,neighborhood,postal_code,latitude,longitude
on public.job_listings
for each row execute function public.normalize_job_listing_location();

-- Replace the N3 RPC with the same canonical search plus optional nearby radius.
drop function if exists public.search_job_listings(text,text,text,text,text,text,text,text,numeric,text,numeric,numeric,integer,integer);

create function public.search_job_listings(
  p_keyword text default null,
  p_category_slug text default null,
  p_employment_type text default null,
  p_state_code text default null,
  p_city text default null,
  p_county text default null,
  p_borough text default null,
  p_neighborhood text default null,
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
  with scored as (
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
        else round((3958.7613 * 2 * asin(least(1::double precision, sqrt(
          power(sin(radians((j.latitude - p_latitude)::double precision) / 2), 2) +
          cos(radians(p_latitude::double precision)) * cos(radians(j.latitude::double precision)) *
          power(sin(radians((j.longitude - p_longitude)::double precision) / 2), 2)
        ))))::numeric, 1)
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
      and (p_salary_min is null or coalesce(j.salary_max,j.salary_min,0) >= p_salary_min)
  )
  select
    s.id,s.title,s.description,s.category_slug,s.employment_type,
    s.salary_min,s.salary_max,s.salary_period,
    s.state_code,s.city,s.county,s.borough,s.neighborhood,
    s.latitude,s.longitude,s.published_at,s.created_at,
    s.miles as distance_miles,s.score as relevance_score
  from scored s
  where p_radius_miles is null
     or (p_latitude is not null and p_longitude is not null and s.miles is not null and s.miles <= p_radius_miles)
  order by
    case when p_sort='distance' then s.miles end asc nulls last,
    case when p_sort='latest' then coalesce(s.published_at,s.created_at) end desc nulls last,
    case when p_sort='salary' then coalesce(s.salary_max,s.salary_min) end desc nulls last,
    case when p_sort='relevance' then s.score end desc nulls last,
    coalesce(s.published_at,s.created_at) desc,
    s.id
  limit greatest(1, least(coalesce(p_limit,50),100))
  offset greatest(0, coalesce(p_offset,0));
$$;

grant execute on function public.search_job_listings(text,text,text,text,text,text,text,text,numeric,text,numeric,numeric,numeric,integer,integer) to anon, authenticated;

comment on function public.normalize_job_listing_location is
  'JOBS-R1-N4 canonical US location normalization. Does not infer precise location from IP and does not create shadow geodata.';
comment on function public.search_job_listings is
  'JOBS-R1-N4 canonical US job search with optional authorized-device distance and 5/10/25/50 mile radius filtering.';

commit;
