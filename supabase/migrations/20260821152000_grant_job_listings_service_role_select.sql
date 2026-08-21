begin;

-- Netlify Functions query the canonical jobs table with the service role.
-- Data API grants are separate from RLS and must be explicit.
grant select on table public.job_listings to service_role;

commit;
