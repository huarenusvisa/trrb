-- Keep the existing article RLS and version history. No recovery of retired content.
alter table public.articles add column if not exists publication_path text;
alter table public.articles add column if not exists publication_html text;
alter table public.articles add column if not exists publication_revision text;
alter table public.articles add column if not exists publication_updated_at timestamptz;

-- Replace the old self-redirect insertion with an actual slug lock.
create or replace function public.lock_article_slug_after_publish() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.slug_locked = true and old.status = 'published' then new.slug := old.slug; end if;
  if new.status = 'published' then new.slug_locked := true; new.hidden_at := null; new.visibility := 'public'; end if;
  if new.status = 'hidden' then new.hidden_at := coalesce(new.hidden_at,now()); new.visibility := 'private'; end if;
  return new;
end $$;

create or replace function public.trrb_uri_segment(value text) returns text
language plpgsql immutable strict security invoker set search_path = '' as $$
declare bytes bytea := convert_to(value, 'UTF8'); result text := ''; b int;
begin
  for i in 0..length(bytes)-1 loop
    b := get_byte(bytes,i);
    if b between 48 and 57 or b between 65 and 90 or b between 97 and 122 or b in (33,39,40,41,42,45,46,95,126) then
      result := result || chr(b);
    else result := result || '%' || upper(lpad(to_hex(b),2,'0')); end if;
  end loop;
  return result;
end $$;

create or replace function public.trrb_publication_before_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare section text; body text; revision text;
begin
  -- This trigger runs after existing category-routing and visibility triggers.
  if tg_op = 'UPDATE' and old.publication_path is not null then
    new.publication_path := old.publication_path;
    new.slug := old.slug;
  else
    new.publication_path := null;
  end if;
  if new.status = 'published' and new.visibility = 'public' and new.hidden_at is null and new.archived_at is null then
    if new.publication_path is null then
      if new.topic_key in ('ice','trump') then section := new.topic_key;
      else
        select c.slug into section from public.categories c where c.is_active = true
          and ((new.category_id is not null and c.id = new.category_id) or (new.category_id is null and c.name = new.category_name)) limit 1;
        section := coalesce(nullif(section,''), case new.category_name
          when '重要新闻' then 'important-news' when '热门头条' then 'hot-headlines'
          when '美国时政' then 'us-politics' when '美国警情' then 'us-crime'
          when '中国官场' then 'china-officialdom' when '移民美国' then 'immigration'
          when '庇护百科' then 'asylum' when '驱逐快报' then 'deport'
          when 'ICE执法动态' then 'ice' when 'ICE执法' then 'ice' else 'news' end);
      end if;
      section := case section when 'important' then 'important-news' when 'hot' then 'hot-headlines'
        when 'politics' then 'us-politics' when 'crime' then 'us-crime' when 'china' then 'china-officialdom' else section end;
      new.publication_path := '/' || public.trrb_uri_segment(section) || '/' || public.trrb_uri_segment(coalesce(nullif(btrim(new.slug),''),new.id::text));
    end if;
    new.slug_locked := true;
    -- Knowledge pages use their existing dedicated canonical renderer.
    if coalesce(new.metadata->>'knowledge_migration_batch','') = '' then
      new.canonical_url := 'https://trrb.net' || new.publication_path;
    end if;
    body := case when btrim(regexp_replace(coalesce(new.content,''),'<[^>]*>','','g')) <> '' then new.content else coalesce(new.summary,'') end;
    select coalesce(string_agg('<p>' || replace(replace(replace(replace(replace(btrim(regexp_replace(p,'\s+',' ','g')),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#039;') || '</p>','' order by ord),'') into new.publication_html
      from regexp_split_to_table(btrim(body),E'\\r?\\n') with ordinality as x(p,ord) where btrim(p) <> '';
    revision := md5(jsonb_build_array(new.title,new.summary,new.content,new.category_name,new.topic_key,new.source_url,new.cover_image,new.author,new.published_at,new.metadata,new.publication_path)::text);
    new.publication_revision := revision;
    if tg_op = 'UPDATE' and old.publication_revision = revision then new.publication_updated_at := old.publication_updated_at;
    else new.publication_updated_at := now(); end if;
  else
    new.publication_html := null;
    new.publication_revision := null;
    new.publication_updated_at := null;
  end if;
  return new;
end $$;
create trigger zzzzz_articles_stable_publication before insert or update on public.articles
for each row execute function public.trrb_publication_before_write();
create unique index articles_publication_path_unique on public.articles(publication_path) where publication_path is not null;

-- Private operational ledger, readable only through the existing authenticated admin.
create table if not exists public.seo_content_inventory_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  commit_sha text,
  summary jsonb not null,
  items jsonb not null
);
alter table public.seo_content_inventory_runs enable row level security;
revoke all on public.seo_content_inventory_runs from anon, authenticated;
grant select,insert,delete on public.seo_content_inventory_runs to service_role;
create index seo_content_inventory_runs_created_at_idx on public.seo_content_inventory_runs(created_at desc);
comment on table public.seo_content_inventory_runs is 'Existing SEO controller full content inventory and search observations; missing engine data is unknown, never not-indexed.';
