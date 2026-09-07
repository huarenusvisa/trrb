begin;

-- A physical Expo token must have one active owner. The per-token advisory lock
-- makes account switches and concurrent reinstall registrations atomic.
create or replace function public.claim_mobile_push_token(
  p_user_id uuid,
  p_platform text,
  p_expo_push_token text,
  p_updated_at timestamptz default now()
)
returns table (token_id bigint, replaced_owner_count bigint)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'user id is required' using errcode = '22023';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'invalid push platform' using errcode = '22023';
  end if;
  if length(p_expo_push_token) > 2048
     or p_expo_push_token !~ '^(Expo(nent)?PushToken)\[[^][[:space:]]{10,512}\]$' then
    raise exception 'invalid Expo push token' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_expo_push_token, 0)
  );

  return query
  with disabled as (
    update public.push_tokens
       set enabled = false,
           updated_at = p_updated_at
     where expo_push_token = p_expo_push_token
       and user_id <> p_user_id
       and enabled = true
    returning id
  ), claimed as (
    insert into public.push_tokens (
      user_id, platform, expo_push_token, enabled, updated_at
    ) values (
      p_user_id, p_platform, p_expo_push_token, true, p_updated_at
    )
    on conflict (user_id, expo_push_token) do update
      set platform = excluded.platform,
          enabled = true,
          updated_at = excluded.updated_at
    returning id
  )
  select claimed.id, (select count(*) from disabled)
    from claimed;
end;
$$;

revoke all on function public.claim_mobile_push_token(uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_mobile_push_token(uuid, text, text, timestamptz)
  to service_role;

commit;
