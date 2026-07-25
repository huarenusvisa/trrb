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

-- Ensure all standard channels exist. This is idempotent and repairs accidental deletion.
insert into public.categories
  (name, slug, sort_order, is_active, show_in_navigation, show_on_homepage, show_in_nav, show_on_home,
   auto_fetch, ai_rewrite, auto_publish, include_in_sitemap, include_in_google_news, include_in_rss,
   push_x, push_telegram, seo_title, seo_description, seo_keywords, ai_prompt)
values
  ('ICE','ice',10,true,true,true,true,true,true,true,true,true,true,true,false,false,
   'ICE执法最新新闻｜唐人日报','追踪美国ICE执法、拘留、遣返及移民政策动态。','ICE,美国移民执法,遣返,拘留',
   '写成客观、写实的中文新闻，核实人物、地点、时间与执法机构；不得把指控写成定罪。'),
  ('Trump','trump',20,true,true,true,true,true,true,true,true,true,true,true,false,false,
   '特朗普最新动态｜唐人日报','特朗普政府、白宫、选举及美国政策最新动态。','特朗普,白宫,美国政治',
   '按新闻事实改写，明确消息来源、时间和政策背景，不添加未经证实的判断。'),
  ('USCIS','uscis',30,true,true,true,true,true,true,true,false,true,true,true,false,false,
   'USCIS移民局最新政策｜唐人日报','美国移民局政策、表格、费用和案件处理动态。','USCIS,美国移民局,移民政策',
   '准确保留政策名称、表格编号、生效日期和适用人群；法律风险内容进入人工审核。'),
  ('DHS','dhs',40,true,true,true,true,true,true,true,false,true,true,true,false,false,
   'DHS国土安全部动态｜唐人日报','美国国土安全部政策与执法动态。','DHS,国土安全部,美国执法',
   '以官方文件和可核实信息为主，标明尚未确认的内容。'),
  ('CBP','cbp',50,true,true,true,true,true,true,true,false,true,true,true,false,false,
   'CBP边境与海关动态｜唐人日报','美国海关与边境保护局执法及口岸政策动态。','CBP,美国边境,海关',
   '准确区分CBP、ICE、HSI等机构，保留地点、数量和官方表述。'),
  ('Visa','visa',60,true,true,true,true,true,false,true,false,true,true,true,false,false,
   '美国签证新闻与政策｜唐人日报','美国签证政策、领事程序与申请动态。','美国签证,签证政策,领事馆',
   '保留签证类别、政策日期和官方来源，不提供保证性结论。'),
  ('China','china',70,true,true,true,true,true,false,true,false,true,true,true,false,false,
   '中国新闻｜唐人日报','中国社会、官场与突发新闻。','中国新闻,中国官场,社会新闻',
   '区分官方通报、网络信息和当事人说法；未获证实内容必须明确标注。'),
  ('Politics','politics',80,true,true,true,true,true,false,true,false,true,true,true,false,false,
   '美国政治新闻｜唐人日报','美国国会、白宫、州政府和选举新闻。','美国政治,国会,选举',
   '保持政治报道中立，准确引用不同阵营观点。'),
  ('World','world',90,true,true,true,true,true,false,true,false,true,true,true,false,false,
   '国际新闻｜唐人日报','全球时政、冲突与重大事件。','国际新闻,全球时政',
   '使用可靠来源，明确事件发生时间和地点，避免夸大未经证实的伤亡或结论。')
on conflict ((lower(slug))) do update set
  name = excluded.name,
  is_active = excluded.is_active,
  show_in_navigation = excluded.show_in_navigation,
  show_on_homepage = excluded.show_on_homepage,
  show_in_nav = excluded.show_in_nav,
  show_on_home = excluded.show_on_home,
  auto_fetch = excluded.auto_fetch,
  ai_rewrite = excluded.ai_rewrite,
  auto_publish = excluded.auto_publish,
  include_in_sitemap = excluded.include_in_sitemap,
  include_in_google_news = excluded.include_in_google_news,
  include_in_rss = excluded.include_in_rss,
  seo_title = excluded.seo_title,
  seo_description = excluded.seo_description,
  seo_keywords = excluded.seo_keywords,
  ai_prompt = excluded.ai_prompt;

-- ICE publisher historically wrote category_name='驱逐快报'. Normalize both existing and future ICE articles.
create or replace function public.assign_article_category_from_topic()
returns trigger language plpgsql as $$
declare
  target record;
begin
  if lower(coalesce(new.topic_key, '')) = 'ice' or lower(coalesce(new.slug, '')) like 'ice-%' then
    select id, name into target
    from public.categories
    where lower(slug) = 'ice'
    limit 1;

    if target.id is not null then
      new.category_id := target.id;
      new.category_name := target.name;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists articles_assign_category_from_topic on public.articles;
create trigger articles_assign_category_from_topic
before insert or update of topic_key, slug, category_id, category_name on public.articles
for each row execute function public.assign_article_category_from_topic();

update public.articles a
set category_id = c.id,
    category_name = c.name
from public.categories c
where lower(c.slug) = 'ice'
  and (lower(coalesce(a.topic_key, '')) = 'ice' or lower(coalesce(a.slug, '')) like 'ice-%')
  and (a.category_id is distinct from c.id or a.category_name is distinct from c.name);
