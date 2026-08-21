begin;

-- Data API grants and RLS are separate controls. Keep the public role read-only;
-- authenticated admins still pass the existing is_jobs_admin() RLS policies.
grant usage on schema public to anon, authenticated, service_role;

grant select on table public.job_seeker_posts
  to anon, authenticated, service_role;
grant insert, update on table public.job_seeker_posts
  to authenticated, service_role;

grant select on table public.job_listings
  to anon, authenticated, service_role;
grant insert, update on table public.job_listings
  to authenticated, service_role;

commit;
