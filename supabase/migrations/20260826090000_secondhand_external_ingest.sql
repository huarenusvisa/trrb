-- 华人工作网二手交易：小规模外部公开信息采集、去重与来源审计。

alter table public.secondhand_listings
  alter column seller_user_id drop not null;

alter table public.secondhand_listing_images
  alter column uploader_user_id drop not null;

alter table public.secondhand_listings
  add column if not exists listing_origin text not null default 'user',
  add column if not exists source_key text,
  add column if not exists source_external_id text,
  add column if not exists source_url text,
  add column if not exists source_published_at timestamptz,
  add column if not exists source_checked_at timestamptz,
  add column if not exists source_payload_hash text,
  add column if not exists dedupe_key text,
  add column if not exists expires_at timestamptz;

alter table public.secondhand_listings
  drop constraint if exists secondhand_listings_origin_check;
alter table public.secondhand_listings
  add constraint secondhand_listings_origin_check
  check (
    (listing_origin = 'user' and seller_user_id is not null and source_key is null)
    or
    (listing_origin = 'external' and seller_user_id is null and source_key is not null and source_external_id is not null and source_url is not null)
  );

create unique index if not exists secondhand_listings_source_unique_idx
  on public.secondhand_listings(source_key, source_external_id)
  where listing_origin = 'external';

create unique index if not exists secondhand_listings_external_dedupe_idx
  on public.secondhand_listings(dedupe_key)
  where listing_origin = 'external' and dedupe_key is not null;

create index if not exists secondhand_listings_external_expiry_idx
  on public.secondhand_listings(listing_origin, status, expires_at)
  where listing_origin = 'external';

alter table public.secondhand_listing_images
  add column if not exists source_url text;

grant all on public.secondhand_listings, public.secondhand_listing_images to service_role;

comment on column public.secondhand_listings.listing_origin is 'user=平台用户发布；external=经质量规则处理的公开来源聚合信息。';
comment on column public.secondhand_listings.source_url is '外部聚合信息必须保留的原始页面链接。';
comment on column public.secondhand_listings.expires_at is '外部信息到期后由采集任务自动下架。';

