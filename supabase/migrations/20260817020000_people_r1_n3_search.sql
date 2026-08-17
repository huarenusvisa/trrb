begin;

create extension if not exists pg_trgm;

create index if not exists people_name_trgm_idx
  on public.people using gin (primary_name_normalized gin_trgm_ops);
create index if not exists people_alias_trgm_idx
  on public.people_aliases using gin (alias_normalized gin_trgm_ops);

create or replace function public.search_published_people(
  search_query text default '',
  state_filter text default null,
  city_filter text default null,
  occupation_filter text default null,
  life_status_filter text default null,
  result_limit integer default 30,
  result_offset integer default 0
)
returns table (
  person_id uuid,
  slug text,
  primary_name text,
  birth_year integer,
  death_year integer,
  life_status text,
  verification_status text,
  us_arrival_year integer,
  states text[],
  cities text[],
  occupations text[],
  match_score real
)
language sql
stable
security invoker
set search_path = public
as $$
  with candidates as (
    select
      p.id,
      p.slug,
      p.primary_name,
      p.primary_name_normalized,
      p.birth_date,
      p.death_date,
      p.life_status,
      p.verification_status,
      p.us_arrival_date,
      greatest(
        case when nullif(btrim(search_query), '') is null then 0::real
             else similarity(p.primary_name_normalized, lower(btrim(search_query))) end,
        coalesce((select max(similarity(a.alias_normalized, lower(btrim(search_query))))::real
                  from public.people_aliases a where a.person_id = p.id), 0::real)
      ) as score
    from public.people p
    where p.publication_status = 'published'
      and (life_status_filter is null or p.life_status = life_status_filter)
      and (state_filter is null or exists (
        select 1 from public.people_us_regions r
        where r.person_id = p.id and upper(r.state_code) = upper(state_filter)
      ))
      and (city_filter is null or exists (
        select 1 from public.people_us_regions r
        where r.person_id = p.id and lower(r.city) = lower(city_filter)
      ))
      and (occupation_filter is null or exists (
        select 1 from public.people_occupations o
        where o.person_id = p.id and lower(o.occupation) like '%' || lower(occupation_filter) || '%'
      ))
      and (
        nullif(btrim(search_query), '') is null
        or p.primary_name_normalized % lower(btrim(search_query))
        or p.primary_name_normalized like '%' || lower(btrim(search_query)) || '%'
        or exists (
          select 1 from public.people_aliases a
          where a.person_id = p.id
            and (a.alias_normalized % lower(btrim(search_query))
                 or a.alias_normalized like '%' || lower(btrim(search_query)) || '%')
        )
      )
  )
  select
    c.id,
    c.slug,
    c.primary_name,
    extract(year from c.birth_date)::integer,
    extract(year from c.death_date)::integer,
    c.life_status,
    c.verification_status,
    extract(year from c.us_arrival_date)::integer,
    coalesce((select array_agg(distinct r.state_code order by r.state_code) from public.people_us_regions r where r.person_id = c.id), '{}'),
    coalesce((select array_agg(distinct r.city order by r.city) filter (where r.city <> '') from public.people_us_regions r where r.person_id = c.id), '{}'),
    coalesce((select array_agg(distinct o.occupation order by o.occupation) from public.people_occupations o where o.person_id = c.id), '{}'),
    c.score
  from candidates c
  order by c.score desc, c.primary_name asc, c.id asc
  limit greatest(1, least(coalesce(result_limit, 30), 100))
  offset greatest(coalesce(result_offset, 0), 0);
$$;

comment on function public.search_published_people(text,text,text,text,text,integer,integer) is
'PEOPLE-R1 N3 public search. Duplicate names are intentionally allowed; person_id is the identity. Results expose only coarse public disambiguators such as years, US regions, occupation and verification state.';

grant execute on function public.search_published_people(text,text,text,text,text,integer,integer) to anon, authenticated;

commit;
