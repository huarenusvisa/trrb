-- Prevent foreign locations from entering the US feed and bound geographic query cost.
-- Shared public feed. No privileged function is exposed to browser roles.
create or replace function public.public_job_category(p_title text,p_category text) returns text
language sql immutable parallel safe security invoker set search_path=public as $$
 select case
 when p_title ~* '(\m(CNA|HHA|RN|LPN)\M|nurs(e|ing)|home health aide|caregiver|personal care aide|护工|護工|护理|護理)' then 'home-care'
 when p_title ~* '(点心|點心|寿司|壽司|煮面|煮麵|炒锅|炒鍋)' then 'restaurant'
 when p_title ~* '(卡车司机|卡車司機|truck driver)' then 'truck-driver'
 when p_title ~* '(仓库|倉庫|warehouse)' and p_title !~* '(厨|廚|餐|销售|銷售|会计|會計|人事|HRBP)' then 'logistics-warehouse'
 else coalesce(p_category,'other') end
$$;
create or replace function public.public_job_visible(j public.job_listings) returns boolean
language sql stable parallel safe security invoker set search_path=public as $$
 select j.country_code='US' and j.status='open' and not j.moderation_hold and j.deleted_at is null
 and j.state_code in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR')
 and not (j.state_code='NY' and j.city in ('Toronto','SEA','SF'))
 and (j.expires_at is null or j.expires_at>now())
 and ((j.contact_public and nullif(trim(j.contact_value),'') is not null and j.contact_method in ('phone','email'))
 or (j.source_key ~* '^(greenhouse_|jazzhr_|lever_|workday_|ashby_)' and j.application_url ~* '^https?://'))
 and not (j.title ~ '(承接|承攬|承揽)' and j.title ~ '(运输服务|運輸服務|搬家|提货|提貨)' and j.title !~ '(招聘|诚聘|誠聘|急招|招工)')
$$;
create or replace function public.public_job_location_facets() returns jsonb
language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from (
 select j.state_code as state,trim(v.name) as name,count(distinct j.id) as count
 from public.job_listings j cross join lateral (select distinct name from unnest(array[j.city,j.borough,j.neighborhood]) name) v
 where public.public_job_visible(j) and nullif(trim(v.name),'') is not null
 group by j.state_code,trim(v.name) order by count(distinct j.id) desc,j.state_code,trim(v.name)
 ) f
$$;
create or replace function public.search_public_job_feed(p_options jsonb) returns jsonb
language sql stable security invoker set search_path=public set enable_nestloop=off set jit=off as $$
 with refs as materialized (select * from jsonb_to_recordset(coalesce(p_options->'centers','[]')) as r(state text,name text,lat double precision,lng double precision)),
 base as (
 select j.*, public.public_job_category(j.title,j.category_slug) as effective_category,
 case when j.latitude between -90 and 90 and j.longitude between -180 and 180 then j.latitude::double precision else coalesce(n.lat,b.lat,c.lat) end as map_latitude,
 case when j.latitude between -90 and 90 and j.longitude between -180 and 180 then j.longitude::double precision else coalesce(n.lng,b.lng,c.lng) end as map_longitude,
 not (j.latitude is not null and j.longitude is not null and j.latitude between -90 and 90 and j.longitude between -180 and 180) as location_approximate
 from public.job_listings j
 left join refs n on n.state=j.state_code and n.name=lower(trim(j.neighborhood))
 left join refs b on b.state=j.state_code and b.name=lower(trim(j.borough))
 left join refs c on c.state=j.state_code and c.name=lower(trim(j.city))
 where j.country_code='US' and j.status='open' and j.moderation_hold=false and public.public_job_visible(j)
 ), filtered as materialized (
 select base.*,case when jsonb_array_length(coalesce(p_options->'origins','[]'))>0 and map_latitude is not null then
 (select min(3958.7613*2*asin(sqrt(least(1.0,power(sin(radians(map_latitude-o.lat)/2),2)+cos(radians(o.lat))*cos(radians(map_latitude))*power(sin(radians(map_longitude-o.lng)/2),2)))))
 from jsonb_to_recordset(p_options->'origins') as o(lat double precision,lng double precision)) end as distance_miles
 from base
 where (nullif(p_options->>'category','') is null or effective_category=p_options->>'category')
 and (nullif(p_options->>'employment','') is null or employment_type=p_options->>'employment')
 and (nullif(p_options->>'salary','') is null or salary_min>=(p_options->>'salary')::numeric)
 and (nullif(p_options->>'q','') is null or title ilike '%'||(p_options->>'q')||'%' or description ilike '%'||(p_options->>'q')||'%')
 and (p_options->>'ids' is null or id::text in (select jsonb_array_elements_text(p_options->'ids')))
 and (coalesce((p_options->>'radius')::numeric,0)>0 or (
 (nullif(p_options->>'state','') is null or state_code=p_options->>'state')
 and (nullif(p_options->>'zip','') is null or left(postal_code,5)=left(p_options->>'zip',5))
 and (jsonb_array_length(coalesce(p_options->'places','[]'))=0 or exists (
 select 1 from jsonb_array_elements(p_options->'places') p
 where (nullif(p->>'state','') is null or state_code=p->>'state')
 and (jsonb_array_length(coalesce(p->'terms','[]'))=0 or exists (
 select 1 from jsonb_array_elements_text(p->'terms') t where
 case when coalesce((p->>'fuzzy')::boolean,false) then
 city ilike '%'||t||'%' or borough ilike '%'||t||'%' or neighborhood ilike '%'||t||'%' or county ilike '%'||t||'%'
 else lower(trim(city))=lower(t) or lower(trim(borough))=lower(t) or lower(trim(neighborhood))=lower(t) or lower(trim(county))=lower(t) end
 ))))))
 ), page as (
 select * from filtered where coalesce((p_options->>'radius')::numeric,0)=0 or distance_miles<=(p_options->>'radius')::numeric
 order by case when coalesce((p_options->>'radius')::numeric,0)>0 or p_options->>'sort'='distance' then distance_miles end asc nulls last,
 case when p_options->>'sort'='salary' then salary_min end desc nulls last,
 published_at desc nulls last,id
 limit least(coalesce((p_options->>'limit')::int,31),61) offset greatest(coalesce((p_options->>'offset')::int,0),0)
 ) select coalesce(jsonb_agg(to_jsonb(page)),'[]'::jsonb) from page
$$;
revoke all on function public.public_job_category(text,text),public.public_job_visible(public.job_listings),public.public_job_location_facets(),public.search_public_job_feed(jsonb) from public,anon,authenticated;
grant execute on function public.public_job_category(text,text),public.public_job_visible(public.job_listings),public.public_job_location_facets(),public.search_public_job_feed(jsonb) to service_role;
