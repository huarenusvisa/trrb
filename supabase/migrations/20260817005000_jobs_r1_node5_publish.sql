begin;

-- N5: minimal employer publishing on the same formal job_listings data source.
alter table public.job_listings
  add column if not exists contact_method text
    check (contact_method is null or contact_method in ('platform','phone','sms','email')),
  add column if not exists contact_value text,
  add column if not exists contact_public boolean not null default false;

alter table public.job_listings
  drop constraint if exists job_listings_contact_value_len;
alter table public.job_listings
  add constraint job_listings_contact_value_len
  check (contact_value is null or char_length(contact_value) <= 320);

create table if not exists public.job_listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.job_listings(id) on delete cascade,
  uploader_user_id uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null unique,
  alt_text text not null default '' check (char_length(alt_text) <= 240),
  sort_order integer not null default 1 check (sort_order between 1 and 8),
  created_at timestamptz not null default now(),
  unique(listing_id, sort_order)
);

create index if not exists job_listing_images_listing_idx
  on public.job_listing_images(listing_id, sort_order);

alter table public.job_listing_images enable row level security;

-- Existing admin_users is the authoritative admin identity table used by /admin.
create or replace function public.is_jobs_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
      and a.is_active = true
      and lower(a.role) in ('owner','admin')
  );
$$;
revoke all on function public.is_jobs_admin() from public;
grant execute on function public.is_jobs_admin() to authenticated;

-- Same-table admin visibility/governance: no shadow recruiting backend.
drop policy if exists "job listings admin read" on public.job_listings;
create policy "job listings admin read" on public.job_listings
  for select using (public.is_jobs_admin());

drop policy if exists "job listings admin govern" on public.job_listings;
create policy "job listings admin govern" on public.job_listings
  for update using (public.is_jobs_admin())
  with check (public.is_jobs_admin() and country_code='US');

drop policy if exists "job seeker posts admin read" on public.job_seeker_posts;
create policy "job seeker posts admin read" on public.job_seeker_posts
  for select using (public.is_jobs_admin());

drop policy if exists "job seeker posts admin govern" on public.job_seeker_posts;
create policy "job seeker posts admin govern" on public.job_seeker_posts
  for update using (public.is_jobs_admin())
  with check (public.is_jobs_admin() and country_code='US');

-- Job image rows follow listing ownership/public lifecycle; admins can inspect/govern them.
drop policy if exists "job images public current history" on public.job_listing_images;
create policy "job images public current history" on public.job_listing_images
  for select using (
    public.is_jobs_admin()
    or uploader_user_id = auth.uid()
    or exists (
      select 1 from public.job_listings l
      where l.id=listing_id and l.status in ('open','filled')
    )
  );

drop policy if exists "job images owner insert" on public.job_listing_images;
create policy "job images owner insert" on public.job_listing_images
  for insert with check (
    uploader_user_id=auth.uid()
    and exists (
      select 1 from public.job_listings l
      where l.id=listing_id and l.employer_user_id=auth.uid()
    )
  );

drop policy if exists "job images owner update" on public.job_listing_images;
create policy "job images owner update" on public.job_listing_images
  for update using (uploader_user_id=auth.uid() or public.is_jobs_admin())
  with check (uploader_user_id=auth.uid() or public.is_jobs_admin());

drop policy if exists "job images owner delete" on public.job_listing_images;
create policy "job images owner delete" on public.job_listing_images
  for delete using (uploader_user_id=auth.uid() or public.is_jobs_admin());

-- Public bucket is only for job environment images. Browser re-encoding strips EXIF before upload.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('job-images','job-images',true,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public=true,
  file_size_limit=8388608,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "job images storage public read" on storage.objects;
create policy "job images storage public read" on storage.objects
  for select using (bucket_id='job-images');

drop policy if exists "job images storage owner insert" on storage.objects;
create policy "job images storage owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id='job-images' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "job images storage owner update" on storage.objects;
create policy "job images storage owner update" on storage.objects
  for update to authenticated
  using (bucket_id='job-images' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_jobs_admin()))
  with check (bucket_id='job-images');

drop policy if exists "job images storage owner delete" on storage.objects;
create policy "job images storage owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id='job-images' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_jobs_admin()));

comment on column public.job_listings.contact_public is
  'Employer choice only. False keeps direct contact hidden from public UI; platform messaging remains available later.';
comment on table public.job_listing_images is
  'Optional employer-uploaded workplace images. Images are not identity or business verification.';

commit;
