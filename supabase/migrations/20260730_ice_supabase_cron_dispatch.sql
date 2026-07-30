-- ICE production scheduler: Supabase Cron is the only production clock.
-- It checks the real pipeline heartbeat every 10 minutes and dispatches the
-- single GitHub Actions production workflow only when the last successful run
-- is stale. The GitHub fine-grained token must be stored in Supabase Vault as
-- `github_actions_dispatch_token` with Actions: Read and write permission for
-- huarenusvisa/trrb.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.ice_scheduler_state (
  scheduler_key text primary key,
  last_checked_at timestamptz,
  last_dispatch_at timestamptz,
  last_request_id bigint,
  last_result text,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.ice_scheduler_state (scheduler_key, last_result)
values ('supabase-cron', 'installed')
on conflict (scheduler_key) do nothing;

create or replace function public.dispatch_ice_pipeline_if_due()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault, cron
as $$
declare
  ny_hour integer := extract(hour from timezone('America/New_York', now()));
  heartbeat_at timestamptz;
  previous_dispatch timestamptz;
  github_token text;
  request_id bigint;
  result jsonb;
begin
  -- One scheduler invocation at a time.
  if not pg_try_advisory_xact_lock(hashtext('trrb-ice-supabase-cron')) then
    return jsonb_build_object('status', 'skipped', 'reason', 'scheduler_locked');
  end if;

  select max(coalesce(last_success_at, last_run_at, updated_at))
    into heartbeat_at
  from public.ice_query_state
  where query_key = 'pipeline:parallel-pipeline';

  select last_dispatch_at
    into previous_dispatch
  from public.ice_scheduler_state
  where scheduler_key = 'supabase-cron'
  for update;

  update public.ice_scheduler_state
  set last_checked_at = now(), updated_at = now()
  where scheduler_key = 'supabase-cron';

  -- Preserve the production rule: New York 02:00-08:00 is paused.
  if ny_hour >= 2 and ny_hour < 8 then
    result := jsonb_build_object(
      'status', 'paused',
      'reason', 'new_york_02_08',
      'heartbeat_at', heartbeat_at
    );
    update public.ice_scheduler_state
      set last_result = result::text, last_error = null, updated_at = now()
      where scheduler_key = 'supabase-cron';
    return result;
  end if;

  -- The scheduler checks every 10 minutes but only dispatches when the real
  -- production success heartbeat is older than 35 minutes.
  if heartbeat_at is not null and heartbeat_at > now() - interval '35 minutes' then
    result := jsonb_build_object(
      'status', 'healthy',
      'heartbeat_at', heartbeat_at,
      'age_seconds', extract(epoch from (now() - heartbeat_at))::bigint
    );
    update public.ice_scheduler_state
      set last_result = result::text, last_error = null, updated_at = now()
      where scheduler_key = 'supabase-cron';
    return result;
  end if;

  -- Prevent repeated dispatches while GitHub is queued or the pipeline has
  -- started but has not yet written its success heartbeat.
  if previous_dispatch is not null and previous_dispatch > now() - interval '20 minutes' then
    result := jsonb_build_object(
      'status', 'cooldown',
      'last_dispatch_at', previous_dispatch,
      'heartbeat_at', heartbeat_at
    );
    update public.ice_scheduler_state
      set last_result = result::text, last_error = null, updated_at = now()
      where scheduler_key = 'supabase-cron';
    return result;
  end if;

  select decrypted_secret
    into github_token
  from vault.decrypted_secrets
  where name = 'github_actions_dispatch_token'
  order by created_at desc
  limit 1;

  if github_token is null or length(github_token) < 20 then
    result := jsonb_build_object('status', 'error', 'reason', 'missing_vault_token');
    update public.ice_scheduler_state
      set last_result = result::text,
          last_error = 'Supabase Vault缺少github_actions_dispatch_token',
          updated_at = now()
      where scheduler_key = 'supabase-cron';
    return result;
  end if;

  -- Record the dispatch before the HTTP call to avoid duplicate launches when
  -- two scheduler ticks overlap.
  update public.ice_scheduler_state
  set last_dispatch_at = now(),
      last_result = 'dispatching',
      last_error = null,
      updated_at = now()
  where scheduler_key = 'supabase-cron';

  select net.http_post(
    url := 'https://api.github.com/repos/huarenusvisa/trrb/actions/workflows/ice-unified-pipeline.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || github_token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'trrb-supabase-cron',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('ref', 'main')
  ) into request_id;

  result := jsonb_build_object(
    'status', 'dispatched',
    'request_id', request_id,
    'heartbeat_at', heartbeat_at
  );

  update public.ice_scheduler_state
  set last_request_id = request_id,
      last_result = result::text,
      last_error = null,
      updated_at = now()
  where scheduler_key = 'supabase-cron';

  return result;
exception
  when others then
    update public.ice_scheduler_state
    set last_result = 'error', last_error = sqlerrm, updated_at = now()
    where scheduler_key = 'supabase-cron';
    return jsonb_build_object('status', 'error', 'message', sqlerrm);
end;
$$;

revoke all on function public.dispatch_ice_pipeline_if_due() from public;

-- Retire every previous database scheduler with the same purpose, then install
-- one canonical job. GitHub Cron and GitHub sentinel workflows are removed from
-- production scheduling by the same release.
do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job
    where jobname in (
      'trrb-ice-supabase-scheduler',
      'trrb-ice-watchdog',
      'ice-pipeline-watchdog',
      'ice-production-scheduler'
    )
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end $$;

select cron.schedule(
  'trrb-ice-supabase-scheduler',
  '*/10 * * * *',
  $cron$select public.dispatch_ice_pipeline_if_due();$cron$
);

comment on function public.dispatch_ice_pipeline_if_due() is
  'Every 10 minutes, checks ICE success heartbeat; outside NY 02:00-08:00, dispatches the unique GitHub production workflow only when stale.';
