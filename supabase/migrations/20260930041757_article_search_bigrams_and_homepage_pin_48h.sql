-- Applied as 20260930041757. The experimental search objects created here are
-- explicitly retired by 20260930043808; no search backfill belongs in migrations.
set lock_timeout='5s';
create or replace function private.trrb_search_text(p_title text,p_summary text,p_content text)
returns text language sql immutable parallel safe set search_path='' as $$
 select lower(translate(normalize(coalesce(p_title,'')||E'\n'||coalesce(p_summary,'')||E'\n'||coalesce(p_content,''),NFKC),'‐‑‒–—','-----'))
$$;
create or replace function private.trrb_search_keys(p_text text)
returns text[] language sql immutable parallel safe set search_path='' as $$
 with chars as (select c,lead(c) over(order by n) nxt from unnest(string_to_array(coalesce(p_text,''),null)) with ordinality x(c,n)),
 tokens as (select '1:'||c token from chars union select '2:'||c||nxt from chars where nxt is not null)
 select coalesce(array_agg(token),'{}'::text[]) from tokens
$$;
create table private.article_search_documents(article_id uuid primary key references public.articles(id) on delete cascade,search_text text not null,search_keys text[] not null);
revoke all on private.article_search_documents from public,anon,authenticated;
create index article_search_documents_keys_gin on private.article_search_documents using gin(search_keys);
create or replace function private.trrb_sync_article_search()
returns trigger language plpgsql security definer set search_path='' as $$
declare txt text;
begin
 if tg_op='UPDATE' and (new.title,new.summary,new.content) is not distinct from (old.title,old.summary,old.content) then return new;end if;
 txt=private.trrb_search_text(new.title,new.summary,new.content);
 insert into private.article_search_documents(article_id,search_text,search_keys) values(new.id,txt,private.trrb_search_keys(txt)) on conflict(article_id) do update set search_text=excluded.search_text,search_keys=excluded.search_keys;
 return new;
end $$;
revoke all on function private.trrb_sync_article_search() from public;
create trigger trrb_article_search_sync after insert or update of title,summary,content on public.articles for each row execute function private.trrb_sync_article_search();

alter table public.articles add column homepage_pinned_at timestamptz,add column homepage_pin_expires_at timestamptz;
create index articles_active_homepage_pins_idx on public.articles(homepage_pin_expires_at,homepage_pinned_at desc) where homepage_pin_expires_at is not null;
create or replace function private.trrb_safe_timestamp(p_value text)
returns timestamptz language plpgsql stable set search_path='' as $$
begin return p_value::timestamptz;exception when others then return null;end $$;
-- Preserve actual historical starts; never renew old pins at migration time.
update public.articles set homepage_pinned_at=coalesce(private.trrb_safe_timestamp(metadata->>'homepage_focus_updated_at'),published_at,created_at),homepage_pin_expires_at=coalesce(private.trrb_safe_timestamp(metadata->>'homepage_focus_updated_at'),published_at,created_at)+interval '48 hours' where metadata->>'homepage_focus_override'='force';
update public.articles set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('homepage_focus_expires_at',homepage_pin_expires_at) where metadata->>'homepage_focus_override'='force';
create or replace function private.trrb_homepage_pin_clock()
returns trigger language plpgsql set search_path='' as $$
declare mode text;oldmode text;requested boolean=false;at_time timestamptz=statement_timestamp();
begin
 mode=coalesce(new.metadata->>'homepage_focus_override','auto');
 if tg_op='UPDATE' then
  oldmode=coalesce(old.metadata->>'homepage_focus_override','auto');
  requested=mode='force' and (oldmode<>'force' or new.metadata->>'homepage_focus_updated_at' is distinct from old.metadata->>'homepage_focus_updated_at');
 else requested=mode='force';end if;
 if mode='force' then
  if requested then new.homepage_pinned_at=at_time;new.homepage_pin_expires_at=at_time+interval '48 hours';
  elsif tg_op='UPDATE' then new.homepage_pinned_at=old.homepage_pinned_at;new.homepage_pin_expires_at=old.homepage_pin_expires_at;end if;
  if new.status<>'published' or new.visibility<>'public' or new.hidden_at is not null or new.archived_at is not null or coalesce(new.published_at,new.created_at)>at_time or new.homepage_pin_expires_at is null or new.homepage_pin_expires_at<=at_time then
   new.metadata=(coalesce(new.metadata,'{}'::jsonb)-'homepage_focus_override'-'homepage_focus_expires_at')||jsonb_build_object('homepage_focus_last_action','expired_or_unpublished','homepage_focus_ended_at',at_time);
   new.is_featured=false;new.homepage_pinned_at=null;new.homepage_pin_expires_at=null;
  else
   new.metadata=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('homepage_focus_updated_at',new.homepage_pinned_at,'homepage_focus_expires_at',new.homepage_pin_expires_at);new.is_featured=true;
  end if;
 else
  new.homepage_pinned_at=null;new.homepage_pin_expires_at=null;
  if oldmode='force' then new.is_featured=false;end if;
 end if;
 return new;
end $$;
create trigger zzzz_homepage_pin_clock before insert or update on public.articles for each row execute function private.trrb_homepage_pin_clock();
create or replace function public.trrb_set_homepage_pin(p_article_id uuid,p_mode text,p_actor text default null)
returns setof public.articles language plpgsql security definer set search_path='' as $$
declare a public.articles;m jsonb;
begin
 if p_mode not in ('force','auto','exclude') or p_mode is null then raise exception '无效的置顶操作';end if;
 select * into a from public.articles where id=p_article_id for update;
 if not found then raise exception '文章不存在';end if;
 if p_mode='force' and (a.status<>'published' or a.visibility<>'public' or a.hidden_at is not null or a.archived_at is not null or coalesce(a.published_at,a.created_at)>statement_timestamp()) then raise exception '只有已发布且公开的文章可以置顶';end if;
 m=(coalesce(a.metadata,'{}'::jsonb)-'homepage_focus_override'-'homepage_focus_expires_at')||jsonb_build_object('homepage_focus_updated_at',clock_timestamp(),'homepage_focus_last_action',p_mode,'homepage_focus_actor',left(coalesce(p_actor,''),160));
 if p_mode<>'auto' then m=m||jsonb_build_object('homepage_focus_override',p_mode);end if;
 return query update public.articles set metadata=m,is_featured=(p_mode='force') where id=p_article_id returning *;
end $$;
revoke all on function public.trrb_set_homepage_pin(uuid,text,text) from public,anon,authenticated;
grant execute on function public.trrb_set_homepage_pin(uuid,text,text) to service_role;
create or replace function private.trrb_expire_homepage_pins()
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 update public.articles set metadata=(coalesce(metadata,'{}'::jsonb)-'homepage_focus_override'-'homepage_focus_expires_at')||jsonb_build_object('homepage_focus_last_action','auto_expired','homepage_focus_ended_at',statement_timestamp()),is_featured=false,homepage_pinned_at=null,homepage_pin_expires_at=null where metadata->>'homepage_focus_override'='force' and (homepage_pin_expires_at is null or homepage_pin_expires_at<=statement_timestamp());
 get diagnostics n=row_count;return n;
end $$;
revoke all on function private.trrb_expire_homepage_pins() from public;
select private.trrb_expire_homepage_pins();
select cron.schedule('trrb-expire-homepage-pins','* * * * *','select private.trrb_expire_homepage_pins();');

create or replace function public.trrb_search_articles_v2(p_terms text[] default '{}'::text[],p_public_only boolean default true,p_status text default null,p_category text default null,p_offset integer default 0,p_limit integer default 51,p_article_id uuid default null,p_pinned_only boolean default false,p_ice_category boolean default false)
returns setof public.articles language plpgsql security definer set search_path='' as $$
declare terms text[];keys text[];
begin
 if p_offset<0 or p_offset>10000000 or p_limit<1 or p_limit>101 then raise exception '无效的分页范围';end if;
 if coalesce(cardinality(p_terms),0)>12 then raise exception '搜索词过多';end if;
 select coalesce(array_agg(lower(translate(normalize(btrim(t),NFKC),'‐‑‒–—','-----'))),'{}'::text[]) into terms from unnest(p_terms)t where btrim(t)<>'' and char_length(t)<=200;
 select coalesce(array_agg(distinct k),'{}'::text[]) into keys from unnest(terms)t cross join lateral unnest(private.trrb_search_keys(t))k;
 return query with hits as materialized(select d.article_id from private.article_search_documents d where cardinality(terms)>0 and d.search_keys @> keys and not exists(select 1 from unnest(terms)t where strpos(d.search_text,t)=0))
 select a.* from public.articles a
 where ((p_article_id is not null and a.id=p_article_id) or (p_article_id is null and (cardinality(terms)=0 or a.id in(select h.article_id from hits h))))
 and (not p_public_only or (a.status='published' and a.visibility='public' and a.hidden_at is null and a.archived_at is null and coalesce(a.published_at,a.created_at)<=statement_timestamp()))
 and (p_status is null or p_status='' or a.status=p_status)
 and (not p_pinned_only or (a.metadata->>'homepage_focus_override'='force' and a.homepage_pinned_at<=statement_timestamp() and a.homepage_pin_expires_at>statement_timestamp() and a.status='published' and a.visibility='public' and a.hidden_at is null and a.archived_at is null))
 and (case when p_ice_category then a.topic_key='ice' or a.category_name in ('ICE执法动态','ICE执法','驱逐快报') else p_category is null or p_category='' or a.category_name=p_category end)
 order by case when p_pinned_only then a.homepage_pinned_at end desc nulls last,a.published_at desc nulls last,a.created_at desc,a.id desc limit p_limit offset p_offset;
end $$;
revoke all on function public.trrb_search_articles_v2(text[],boolean,text,text,integer,integer,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.trrb_search_articles_v2(text[],boolean,text,text,integer,integer,uuid,boolean,boolean) to service_role;
notify pgrst,'reload schema';
