begin;

-- Public direct-detail access must use the same governance boundary as current
-- search. An open listing that is held by moderation or has expired must not
-- remain anonymously readable merely because its UUID is known.
drop policy if exists "job listings public current and history" on public.job_listings;
create policy "job listings public current and history" on public.job_listings
  for select using (
    auth.uid() = employer_user_id
    or (
      moderation_hold = false
      and (
        (status = 'open' and (expires_at is null or expires_at > now()))
        or status = 'filled'
      )
    )
  );

comment on policy "job listings public current and history" on public.job_listings is
  'Anonymous direct detail access matches current-search governance: open must be unheld and unexpired; filled history may remain public when unheld. Owners retain access to their own lifecycle records.';

commit;
