begin;

create table if not exists public.job_seeker_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  avatar_path text,
  experience text not null default '' check (char_length(experience) <= 12000),
  bio text not null default '' check (char_length(bio) <= 6000),
  target_role text not null default '' check (char_length(target_role) <= 120),
  target_state_code text check (target_state_code is null or char_length(target_state_code) between 2 and 3),
  target_city text check (target_city is null or char_length(target_city) <= 120),
  target_county text check (target_county is null or char_length(target_county) <= 120),
  target_borough text check (target_borough is null or char_length(target_borough) <= 120),
  target_neighborhood text check (target_neighborhood is null or char_length(target_neighborhood) <= 120),
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or char_length(email) <= 320),
  phone_public boolean not null default false,
  email_public boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.job_seeker_profiles enable row level security;

drop policy if exists "seeker profile public owner admin read" on public.job_seeker_profiles;
create policy "seeker profile public owner admin read" on public.job_seeker_profiles
  for select using (
    user_id=auth.uid() or public.is_jobs_admin()
    or exists (select 1 from public.job_seeker_posts p where p.seeker_user_id=user_id and p.status='seeking')
  );

drop policy if exists "seeker profile owner insert" on public.job_seeker_profiles;
create policy "seeker profile owner insert" on public.job_seeker_profiles
  for insert with check (user_id=auth.uid());

drop policy if exists "seeker profile owner update" on public.job_seeker_profiles;
create policy "seeker profile owner update" on public.job_seeker_profiles
  for update using (user_id=auth.uid() or public.is_jobs_admin())
  with check (user_id=auth.uid() or public.is_jobs_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('job-profile-images','job-profile-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "job profile images public read" on storage.objects;
create policy "job profile images public read" on storage.objects for select using (bucket_id='job-profile-images');
drop policy if exists "job profile images owner insert" on storage.objects;
create policy "job profile images owner insert" on storage.objects for insert to authenticated
  with check (bucket_id='job-profile-images' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "job profile images owner update" on storage.objects;
create policy "job profile images owner update" on storage.objects for update to authenticated
  using (bucket_id='job-profile-images' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_jobs_admin()))
  with check (bucket_id='job-profile-images');
drop policy if exists "job profile images owner delete" on storage.objects;
create policy "job profile images owner delete" on storage.objects for delete to authenticated
  using (bucket_id='job-profile-images' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_jobs_admin()));

-- Public-safe view never exposes non-public direct contact values.
create or replace view public.job_seeker_profiles_public
with (security_invoker=true)
as
select
  user_id, display_name, avatar_path, experience, bio, target_role,
  target_state_code, target_city, target_county, target_borough, target_neighborhood,
  case when phone_public then phone else null end as phone,
  case when email_public then email else null end as email,
  phone_public, email_public, updated_at
from public.job_seeker_profiles;

grant select on public.job_seeker_profiles_public to anon, authenticated;

comment on table public.job_seeker_profiles is
  'JOBS-R1 seeker profile on unified account. Do not store government IDs, SSNs, bank/card data, immigration document numbers, or other high-sensitive identity/financial data.';

commit;
