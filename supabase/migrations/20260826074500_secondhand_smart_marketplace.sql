-- 华人工作网二手交易：Web 与 APP 共用的商品、图片及发布生命周期。

create table if not exists public.secondhand_listings (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  category_slug text not null check (category_slug in ('digital','baby','fashion','moving','hobby','free','home')),
  title text not null check (char_length(title) between 1 and 60),
  description text not null default '' check (char_length(description) <= 4000),
  price numeric(12,2) not null default 0 check (price >= 0),
  currency text not null default 'USD' check (currency = 'USD'),
  item_condition text not null default 'used_good' check (item_condition in ('new','like_new','used_good','used_fair','needs_repair')),
  country_code text not null default 'US' check (country_code = 'US'),
  state_code text,
  city text not null,
  neighborhood text,
  postal_code text,
  location_label text not null,
  approximate_lat numeric(8,3),
  approximate_lng numeric(9,3),
  contact_value text not null check (char_length(contact_value) between 3 and 320),
  contact_public boolean not null default true,
  ai_suggestion jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('draft','pending','published','paused','sold','deleted')),
  moderation_hold boolean not null default false,
  status_reason text,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists secondhand_listings_public_idx
  on public.secondhand_listings(status, moderation_hold, published_at desc, created_at desc);
create index if not exists secondhand_listings_owner_idx
  on public.secondhand_listings(seller_user_id, updated_at desc);
create index if not exists secondhand_listings_category_location_idx
  on public.secondhand_listings(category_slug, state_code, city, status, published_at desc);

create table if not exists public.secondhand_listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.secondhand_listings(id) on delete cascade,
  uploader_user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  width integer,
  height integer,
  sort_order smallint not null check (sort_order between 0 and 7),
  alt_text text check (char_length(alt_text) <= 180),
  created_at timestamptz not null default now(),
  unique (listing_id, sort_order)
);

create index if not exists secondhand_listing_images_listing_idx
  on public.secondhand_listing_images(listing_id, sort_order);

create or replace function public.secondhand_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  if new.status = 'deleted' and old.status is distinct from 'deleted' then new.deleted_at = now(); end if;
  if new.status <> 'deleted' then new.deleted_at = null; end if;
  return new;
end;
$$;

drop trigger if exists secondhand_listings_touch_updated_at on public.secondhand_listings;
create trigger secondhand_listings_touch_updated_at
before update on public.secondhand_listings
for each row execute function public.secondhand_touch_updated_at();

create or replace function public.secondhand_limit_images()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.secondhand_listing_images where listing_id = new.listing_id) >= 8 then
    raise exception '每件商品最多上传8张图片';
  end if;
  return new;
end;
$$;

drop trigger if exists secondhand_listing_images_limit on public.secondhand_listing_images;
create trigger secondhand_listing_images_limit
before insert on public.secondhand_listing_images
for each row execute function public.secondhand_limit_images();

alter table public.secondhand_listings enable row level security;
alter table public.secondhand_listing_images enable row level security;

drop policy if exists "secondhand public or owner read" on public.secondhand_listings;
create policy "secondhand public or owner read" on public.secondhand_listings
for select to anon, authenticated
using ((status in ('published','sold') and moderation_hold = false) or (select auth.uid()) = seller_user_id);

drop policy if exists "secondhand owner insert" on public.secondhand_listings;
create policy "secondhand owner insert" on public.secondhand_listings
for insert to authenticated
with check ((select auth.uid()) = seller_user_id and status in ('draft','pending'));

drop policy if exists "secondhand owner update" on public.secondhand_listings;
create policy "secondhand owner update" on public.secondhand_listings
for update to authenticated
using ((select auth.uid()) = seller_user_id)
with check ((select auth.uid()) = seller_user_id and status in ('draft','pending','paused','sold','deleted'));

drop policy if exists "secondhand images public or owner read" on public.secondhand_listing_images;
create policy "secondhand images public or owner read" on public.secondhand_listing_images
for select to anon, authenticated
using (exists (
  select 1 from public.secondhand_listings listing
  where listing.id = listing_id and ((listing.status in ('published','sold') and listing.moderation_hold = false) or listing.seller_user_id = (select auth.uid()))
));

drop policy if exists "secondhand images owner insert" on public.secondhand_listing_images;
create policy "secondhand images owner insert" on public.secondhand_listing_images
for insert to authenticated
with check (
  (select auth.uid()) = uploader_user_id
  and exists (select 1 from public.secondhand_listings listing where listing.id = listing_id and listing.seller_user_id = (select auth.uid()))
);

drop policy if exists "secondhand images owner update" on public.secondhand_listing_images;
create policy "secondhand images owner update" on public.secondhand_listing_images
for update to authenticated
using ((select auth.uid()) = uploader_user_id)
with check ((select auth.uid()) = uploader_user_id);

drop policy if exists "secondhand images owner delete" on public.secondhand_listing_images;
create policy "secondhand images owner delete" on public.secondhand_listing_images
for delete to authenticated
using ((select auth.uid()) = uploader_user_id);

grant select on public.secondhand_listings, public.secondhand_listing_images to anon;
grant select, insert on public.secondhand_listings, public.secondhand_listing_images to authenticated;
grant update (category_slug,title,description,price,item_condition,state_code,city,neighborhood,postal_code,location_label,approximate_lat,approximate_lng,contact_value,contact_public,ai_suggestion,status,status_reason,deleted_at) on public.secondhand_listings to authenticated;
grant update (sort_order,alt_text) on public.secondhand_listing_images to authenticated;
grant delete on public.secondhand_listing_images to authenticated;
grant all on public.secondhand_listings, public.secondhand_listing_images to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('secondhand-images','secondhand-images',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "secondhand storage owner insert" on storage.objects;
create policy "secondhand storage owner insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'secondhand-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "secondhand storage owner select" on storage.objects;
create policy "secondhand storage owner select" on storage.objects
for select to authenticated
using (bucket_id = 'secondhand-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "secondhand storage owner update" on storage.objects;
create policy "secondhand storage owner update" on storage.objects
for update to authenticated
using (bucket_id = 'secondhand-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'secondhand-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "secondhand storage owner delete" on storage.objects;
create policy "secondhand storage owner delete" on storage.objects
for delete to authenticated
using (bucket_id = 'secondhand-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

comment on table public.secondhand_listings is '华人工作网 Web 与 APP 共用的二手商品主表；卖家可修改、下架、标记已售和软删除。';
comment on column public.secondhand_listings.location_label is '公开展示的大概区域，不保存或显示家庭门牌号。';
comment on column public.secondhand_listings.approximate_lat is '经用户授权并四舍五入后的近似纬度，仅用于区域搜索。';
comment on column public.secondhand_listings.approximate_lng is '经用户授权并四舍五入后的近似经度，仅用于区域搜索。';
comment on table public.secondhand_listing_images is '每件商品最多8张图；sort_order=0为封面，Web 与 APP 均按顺序展示。';
