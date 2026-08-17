begin;

-- JOBS-R2 N9: keep the user's job-search preference in the same account table,
-- while allowing the existing jobs-admin role to inspect governance metadata.
-- Exact coordinates remain RLS-protected from ordinary users and are deliberately
-- not rendered by the admin UI introduced in this node.

drop policy if exists "job search locations admins read" on public.job_search_locations;
create policy "job search locations admins read"
  on public.job_search_locations
  for select
  using (public.is_jobs_admin());

comment on policy "job search locations admins read" on public.job_search_locations is
  'JOBS-R2 N9: existing jobs admins may inspect account job-search-location governance state. Admin UI must not display raw latitude/longitude.';

commit;