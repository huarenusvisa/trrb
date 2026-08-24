grant select, insert, update on table public.job_ingest_raw to service_role;
grant select, insert, update on table public.job_listings to service_role;
grant select, update on table public.job_source_registry to service_role;
grant usage, select on sequence public.job_ingest_raw_id_seq to service_role;
