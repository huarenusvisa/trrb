-- TRRB category CMS v3
-- One shared configuration source for admin, homepage, navigation, collectors and SEO feeds.
-- Canonical field names are show_in_navigation and show_on_homepage.

alter table public.categories
  add column if not exists show_in_navigation boolean not null default true,
  add column if not exists show_on_homepage boolean not null default true,
  add column if not exists show_in_nav boolean not null default true,
  add column if not exists show_on_home boolean not null default true,
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

-- Preserve values created by the earlier short-lived names.
update public.categories
set show_in_navigation = coalesce(show_in_nav, show_in_navigation, true),
    show_on_homepage = coalesce(show_on_home, show_on_homepage, true),
    show_in_nav = coalesce(show_in_navigation, show_in_nav, true),
    show_on_home = coalesce(show_on_homepage, show_on_home, true);

create unique index if not exists categories_slug_unique_idx on public.categories (lower(slug));

create or replace function public.sync_category_cms_fields()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.show_in_navigation := coalesce(new.show_in_navigation, new.show_in_nav, true);
    new.show_in_nav := new.show_in_navigation;
    new.show_on_homepage := coalesce(new.show_on_homepage, new.show_on_home, true);
    new.show_on_home := new.show_on_homepage;
  else
    if new.show_in_navigation is distinct from old.show_in_navigation then
      new.show_in_nav := new.show_in_navigation;
    elsif new.show_in_nav is distinct from old.show_in_nav then
      new.show_in_navigation := new.show_in_nav;
    end if;

    if new.show_on_homepage is distinct from old.show_on_homepage then
      new.show_on_home := new.show_on_homepage;
    elsif new.show_on_home is distinct from old.show_on_home then
      new.show_on_homepage := new.show_on_home;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists categories_touch_updated_at on public.categories;
drop trigger if exists categories_sync_cms_fields on public.categories;
create trigger categories_sync_cms_fields
before insert or update on public.categories
for each row execute function public.sync_category_cms_fields();

-- Default policy values for the standard channels.
update public.categories set
  show_in_navigation = true,
  show_on_homepage = true,
  show_in_nav = true,
  show_on_home = true,
  auto_fetch = slug in ('ice','trump','uscis','dhs','cbp'),
  ai_rewrite = true,
  auto_publish = slug in ('ice','trump'),
  include_in_sitemap = true,
  include_in_google_news = true,
  include_in_rss = true
where slug in ('ice','trump','uscis','dhs','cbp','visa','china','politics','world');