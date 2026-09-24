alter table public.seo_content_inventory_runs add column is_complete boolean not null default false;
create table public.seo_content_inventory_items (
  run_id uuid not null references public.seo_content_inventory_runs(id) on delete cascade,
  article_id uuid not null,
  pilot boolean not null,
  issues text[] not null,
  search_text text not null,
  payload jsonb not null,
  primary key (run_id,article_id)
);
alter table public.seo_content_inventory_items enable row level security;
revoke all on public.seo_content_inventory_items from anon,authenticated;
grant select,insert,update,delete on public.seo_content_inventory_items to service_role;
grant update on public.seo_content_inventory_runs to service_role;

-- Only the server-side admin wrapper can call this; it authenticates owner/editor first.
create function public.seo_inventory_page(p_page integer default 1,p_query text default '',p_pilot boolean default false,p_issue text default '') returns jsonb
language sql stable security invoker set search_path = '' as $$
  with latest as (
    select id,created_at,commit_sha,summary from public.seo_content_inventory_runs where is_complete order by created_at desc limit 1
  ), matching as (
    select i.article_id,i.payload from public.seo_content_inventory_items i join latest r on r.id=i.run_id
    where (not coalesce(p_pilot,false) or i.pilot)
      and (coalesce(p_issue,'')='' or p_issue=any(i.issues))
      and (coalesce(p_query,'')='' or i.search_text ilike '%'||left(p_query,200)||'%')
  ), page_rows as (
    select payload from matching order by article_id limit 50 offset (greatest(1,least(coalesce(p_page,1),100000))-1)*50
  )
  select to_jsonb(latest) || jsonb_build_object('items',coalesce((select jsonb_agg(payload) from page_rows),'[]'::jsonb),'total',(select count(*) from matching),'page',greatest(1,coalesce(p_page,1)),'has_more',(select count(*) from matching)>greatest(1,coalesce(p_page,1))*50) from latest;
$$;
revoke all on function public.seo_inventory_page(integer,text,boolean,text) from public,anon,authenticated;
grant execute on function public.seo_inventory_page(integer,text,boolean,text) to service_role;
