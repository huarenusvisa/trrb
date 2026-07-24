-- TRRB category CMS v3
-- One shared configuration source for admin, homepage, navigation, collectors and SEO feeds.
-- Canonical field names must match the admin/frontend/workflow code.

alter table public.categories
  add column if not exists show_in_navigation boolean not null default true,
  add column if not exists show_on_homepage boolean not null default true,
  add column if not exists auto_fetch boolean not null default false,
  add column if not exists ai_rewrite boolean not null default true,
  add column if not exists auto_publish boolean not null default false,
  add column if not exists include_in_sitemap boolean not null default true,
  add column if not exists include_in_google_news boolean not null default true,
  add column if not exists include_in_rss boolean not null default true,
  add column if not exists push_x boolean not null default false,
  add column if not exists push_telegram boolean not null default false,
  add column if not exists seo_title text not null default '',
  add column if not exists seo_description text not null default '',
  add column if not exists seo_keywords text not null default '',
  add column if not exists ai_prompt text not null default '',
  add column if not exists updated_at timestamptz not null default now();

-- Preserve values from the earlier short-lived field names when they exist.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categories' and column_name = 'show_in_nav'
  ) then
    execute 'update public.categories set show_in_navigation = show_in_nav';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'categories' and column_name = 'show_on_home'
  ) then
    execute 'update public.categories set show_on_homepage = show_on_home';
  end if;
end
$$;

create unique index if not exists categories_slug_unique_idx on public.categories (lower(slug));

create or replace function public.touch_category_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists categories_touch_updated_at on public.categories;
create trigger categories_touch_updated_at
before update on public.categories
for each row execute function public.touch_category_updated_at();

-- Default policy values for the standard channels.
update public.categories set
  show_in_navigation = true,
  show_on_homepage = true,
  auto_fetch = slug in ('ice','trump','uscis','dhs','cbp'),
  ai_rewrite = true,
  auto_publish = slug in ('ice','trump'),
  include_in_sitemap = true,
  include_in_google_news = true,
  include_in_rss = true
where slug in ('ice','trump','uscis','dhs','cbp','visa','china','politics','world');
