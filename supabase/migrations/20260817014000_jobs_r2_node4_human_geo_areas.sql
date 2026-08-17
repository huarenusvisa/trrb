begin;

-- JOBS-R2 N4: front-end discovery labels that reduce US administrative-geography burden.
-- This is a reference catalog only; listings remain in canonical public.job_listings.
create table if not exists public.job_discovery_areas (
  slug text primary key,
  label_zh text not null,
  label_en text not null,
  area_type text not null check (area_type in ('metro','city','borough','neighborhood','region')),
  state_code text,
  city text,
  county text,
  borough text,
  neighborhood text,
  metro_slug text,
  center_latitude numeric(9,6) not null check (center_latitude between -90 and 90),
  center_longitude numeric(9,6) not null check (center_longitude between -180 and 180),
  default_radius_miles integer not null default 25 check (default_radius_miles in (5,10,25,50)),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_discovery_areas_active_sort_idx
  on public.job_discovery_areas(is_active, sort_order, label_zh);
create index if not exists job_discovery_areas_metro_idx
  on public.job_discovery_areas(metro_slug);

alter table public.job_discovery_areas enable row level security;
create policy "job discovery areas public read" on public.job_discovery_areas
  for select using (is_active = true);

insert into public.job_discovery_areas
(slug,label_zh,label_en,area_type,state_code,city,county,borough,neighborhood,metro_slug,center_latitude,center_longitude,default_radius_miles,sort_order)
values
('nyc-metro','纽约都会区','New York metropolitan area','metro',null,null,null,null,null,'nyc-metro',40.712800,-74.006000,50,10),
('flushing-ny','法拉盛','Flushing','neighborhood','NY','New York City','Queens County','Queens','Flushing','nyc-metro',40.767500,-73.833100,10,11),
('long-island-ny','长岛','Long Island','region','NY',null,null,null,null,'nyc-metro',40.789100,-73.135000,50,12),
('north-nj','新泽西北部','North New Jersey','region','NJ',null,null,null,null,'nyc-metro',40.850000,-74.120000,25,13),
('la-metro','洛杉矶地区','Los Angeles metropolitan area','metro','CA','Los Angeles',null,null,null,'la-metro',34.052200,-118.243700,50,20),
('sf-bay-area','旧金山湾区','San Francisco Bay Area','metro','CA',null,null,null,null,'sf-bay-area',37.774900,-122.419400,50,30),
('boston-metro','波士顿地区','Boston metropolitan area','metro','MA','Boston',null,null,null,'boston-metro',42.360100,-71.058900,25,40),
('chicago-metro','芝加哥地区','Chicago metropolitan area','metro','IL','Chicago',null,null,null,'chicago-metro',41.878100,-87.629800,50,50),
('seattle-metro','西雅图地区','Seattle metropolitan area','metro','WA','Seattle',null,null,null,'seattle-metro',47.606200,-122.332100,25,60),
('houston-metro','休斯顿地区','Houston metropolitan area','metro','TX','Houston',null,null,null,'houston-metro',29.760400,-95.369800,50,70),
('dallas-metro','达拉斯地区','Dallas–Fort Worth metropolitan area','metro','TX',null,null,null,null,'dallas-metro',32.776700,-96.797000,50,80),
('las-vegas-metro','拉斯维加斯地区','Las Vegas metropolitan area','metro','NV','Las Vegas',null,null,null,'las-vegas-metro',36.169900,-115.139800,25,90),
('dc-metro','华盛顿都会区','Washington metropolitan area','metro',null,'Washington',null,null,null,'dc-metro',38.907200,-77.036900,50,100)
on conflict (slug) do update set
  label_zh=excluded.label_zh,
  label_en=excluded.label_en,
  area_type=excluded.area_type,
  state_code=excluded.state_code,
  city=excluded.city,
  county=excluded.county,
  borough=excluded.borough,
  neighborhood=excluded.neighborhood,
  metro_slug=excluded.metro_slug,
  center_latitude=excluded.center_latitude,
  center_longitude=excluded.center_longitude,
  default_radius_miles=excluded.default_radius_miles,
  sort_order=excluded.sort_order,
  is_active=true,
  updated_at=now();

grant select on public.job_discovery_areas to anon, authenticated;

comment on table public.job_discovery_areas is
  'JOBS-R2 human-friendly US job-search area catalog. It maps Chinese/common labels to standardized geography and/or a search center; it is not a second job-listings data source.';

commit;
