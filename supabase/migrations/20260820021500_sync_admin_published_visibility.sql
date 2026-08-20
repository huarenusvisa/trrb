-- Ensure articles explicitly published through admin-publisher-v2 become public,
-- while preserving private-by-default behavior for all other records.

create or replace function public.trrb_sync_admin_published_visibility()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published'
     and coalesce(new.metadata->>'publisher_version', '') = 'admin-publisher-v2'
     and coalesce(new.metadata->>'requested_status', '') = 'published'
     and new.hidden_at is null
     and new.archived_at is null then
    new.visibility := 'public';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trrb_sync_admin_published_visibility on public.articles;
create trigger trg_trrb_sync_admin_published_visibility
before insert or update of status, metadata, hidden_at, archived_at
on public.articles
for each row
execute function public.trrb_sync_admin_published_visibility();

-- Backfill only records that are provably intended for public publication.
update public.articles
set visibility = 'public'
where status = 'published'
  and visibility = 'private'
  and coalesce(metadata->>'publisher_version', '') = 'admin-publisher-v2'
  and coalesce(metadata->>'requested_status', '') = 'published'
  and hidden_at is null
  and archived_at is null;
