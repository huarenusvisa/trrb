-- One server-only budget shared by the two existing news robots. USD micro-units.
create table public.news_budget_policy (
  id boolean primary key default true check (id),
  monthly_target_micros bigint not null default 1000000000,
  monthly_cap_micros bigint not null default 900000000,
  daily_cap_micros bigint not null default 30000000,
  tracking_started_at timestamptz not null default now(),
  enabled boolean not null default true
);
insert into public.news_budget_policy (id) values (true);
create table public.news_cost_requests (
  id uuid primary key,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  pipeline text not null check (pipeline in ('ice','china-hot')),
  provider text not null check (provider in ('x','openai')),
  phase text not null,
  run_id text not null,
  reserved_micros bigint not null check (reserved_micros > 0),
  cost_micros bigint check (cost_micros >= 0),
  usage jsonb not null default '{}'::jsonb
);
create index news_cost_requests_created_idx on public.news_cost_requests (created_at);
create table public.news_x_checkpoints (
  key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.news_budget_policy enable row level security;
alter table public.news_cost_requests enable row level security;
alter table public.news_x_checkpoints enable row level security;
revoke all on public.news_budget_policy, public.news_cost_requests, public.news_x_checkpoints from public, anon, authenticated;
grant select,insert,update,delete on public.news_budget_policy, public.news_cost_requests, public.news_x_checkpoints to service_role;

create function public.news_budget_reserve(p_id uuid, p_pipeline text, p_provider text, p_phase text, p_run_id text, p_micros bigint, p_priority boolean default true)
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
  reason := case
    when not policy.enabled then 'budget_paused'
    when month_used+p_micros > month_cap then 'monthly_cap'
    when day_used+p_micros > day_cap then 'daily_cap'
    when hour_used+p_micros > day_cap/12 then 'hourly_pacing'
    when pipeline_used+p_micros > day_cap*0.60 then 'pipeline_daily_share'
    when p_provider='x' and x_used+p_micros > day_cap*0.60 then 'x_daily_share'
    when not p_priority and (day_used+p_micros > day_cap*0.80 or month_used+p_micros > month_cap*0.80 or (p_provider='x' and x_used+p_micros > day_cap*0.40)) then 'priority_reserve'
    else null end;
  if reason is not null then return jsonb_build_object('allowed',false,'reason',reason); end if;
  insert into public.news_cost_requests (id,pipeline,provider,phase,run_id,reserved_micros)
    values (p_id,p_pipeline,p_provider,left(p_phase,100),left(p_run_id,100),p_micros);
  return jsonb_build_object('allowed',true,'monthly_cap_micros',month_cap,'daily_cap_micros',day_cap);
end $$;

create function public.news_budget_settle(p_id uuid, p_micros bigint, p_usage jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare changed integer;
begin
  if p_micros is null or p_micros < 0 then raise exception 'invalid news cost'; end if;
  perform 1 from public.news_budget_policy where id=true for update;
  update public.news_cost_requests set cost_micros=p_micros, usage=p_usage, settled_at=now()
    where id=p_id and settled_at is null;
  get diagnostics changed = row_count;
  return jsonb_build_object('settled',changed=1);
end $$;

create function public.news_budget_report()
returns jsonb language sql stable security invoker set search_path = '' as $$
select jsonb_build_object(
  'policy',(select to_jsonb(p) from public.news_budget_policy p where id=true),
  'month_utc',to_char(now() at time zone 'UTC','YYYY-MM'),
  'totals',coalesce((select jsonb_agg(t) from (
    select pipeline,provider,count(*) requests,
      sum(coalesce(cost_micros,reserved_micros)) budget_used_micros,
      coalesce(sum(reserved_micros) filter (where settled_at is null),0) unresolved_micros,
      coalesce(sum(coalesce(cost_micros,reserved_micros)) filter (where created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0) today_micros
    from public.news_cost_requests where created_at >= date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'
    group by pipeline,provider
  ) t),'[]'::jsonb)
) $$;
revoke all on function public.news_budget_reserve(uuid,text,text,text,text,bigint,boolean), public.news_budget_settle(uuid,bigint,jsonb), public.news_budget_report() from public, anon, authenticated;
grant execute on function public.news_budget_reserve(uuid,text,text,text,text,bigint,boolean), public.news_budget_settle(uuid,bigint,jsonb), public.news_budget_report() to service_role;
