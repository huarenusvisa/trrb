-- Reserve research capacity within each hourly burst, as well as daily totals.
create or replace function public.news_budget_reserve(p_id uuid, p_pipeline text, p_provider text, p_phase text, p_run_id text, p_micros bigint, p_priority boolean default true)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  policy public.news_budget_policy%rowtype;
  month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  month_cap bigint;
  day_cap bigint;
  month_used bigint;
  day_used bigint;
  pipeline_used bigint;
  x_used bigint;
  hour_used bigint;
  hour_x_used bigint;
  hour_pipeline_used bigint;
  reason text;
begin
  if p_micros is null or p_micros <= 0 or p_micros > 10000000 or p_pipeline not in ('ice','china-hot') or p_provider not in ('x','openai') then
    raise exception 'invalid news budget reservation';
  end if;
  -- All callers lock the same row BEFORE reading totals: concurrent jobs cannot oversubscribe.
  select * into strict policy from public.news_budget_policy where id = true for update;
  if exists (select 1 from public.news_cost_requests where id = p_id) then
    return jsonb_build_object('allowed',false,'reason','reservation_already_used');
  end if;
  month_cap := policy.monthly_cap_micros;
  -- We cannot reconstruct earlier invoices. Initial partial month gets only its remaining-day share.
  if policy.tracking_started_at >= month_start then
    month_cap := floor(month_cap * extract(epoch from ((month_start + interval '1 month') - (date_trunc('day', policy.tracking_started_at at time zone 'UTC') at time zone 'UTC'))) / extract(epoch from ((month_start + interval '1 month') - month_start)));
  end if;
  day_cap := least(policy.daily_cap_micros, floor(policy.monthly_cap_micros / extract(day from ((month_start + interval '1 month') - interval '1 day'))));
  select coalesce(sum(coalesce(cost_micros,reserved_micros)),0),
    coalesce(sum(coalesce(cost_micros,reserved_micros)) filter (where created_at >= day_start),0),
    coalesce(sum(coalesce(cost_micros,reserved_micros)) filter (where created_at >= day_start and pipeline=p_pipeline),0),
    coalesce(sum(coalesce(cost_micros,reserved_micros)) filter (where created_at >= day_start and provider='x'),0)
  into month_used, day_used, pipeline_used, x_used
  from public.news_cost_requests where created_at >= month_start;
  select coalesce(sum(coalesce(cost_micros,reserved_micros)),0) into hour_used from public.news_cost_requests where created_at >= date_trunc('hour',now() at time zone 'UTC') at time zone 'UTC';
  select coalesce(sum(coalesce(cost_micros,reserved_micros)) filter (where provider='x'),0), coalesce(sum(coalesce(cost_micros,reserved_micros)) filter (where pipeline=p_pipeline),0) into hour_x_used,hour_pipeline_used from public.news_cost_requests where created_at >= date_trunc('hour',now() at time zone 'UTC') at time zone 'UTC';
  reason := case
    when not policy.enabled then 'budget_paused'
    when month_used+p_micros > month_cap then 'monthly_cap'
    when day_used+p_micros > day_cap then 'daily_cap'
    when hour_used+p_micros > day_cap/12 then 'hourly_pacing'
    when p_provider='x' and hour_x_used+p_micros > day_cap/20 then 'hourly_research_reserve'
    when hour_pipeline_used+p_micros > day_cap/20 then 'pipeline_hourly_share'
    when pipeline_used+p_micros > day_cap*0.60 then 'pipeline_daily_share'
    when p_provider='x' and x_used+p_micros > day_cap*0.60 then 'x_daily_share'
    when not p_priority and (day_used+p_micros > day_cap*0.80 or month_used+p_micros > month_cap*0.80 or (p_provider='x' and x_used+p_micros > day_cap*0.40)) then 'priority_reserve'
    else null end;
  if reason is not null then return jsonb_build_object('allowed',false,'reason',reason); end if;
  insert into public.news_cost_requests (id,pipeline,provider,phase,run_id,reserved_micros)
    values (p_id,p_pipeline,p_provider,left(p_phase,100),left(p_run_id,100),p_micros);
  return jsonb_build_object('allowed',true,'monthly_cap_micros',month_cap,'daily_cap_micros',day_cap);
end $$;
