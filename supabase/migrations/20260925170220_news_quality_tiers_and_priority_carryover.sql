CREATE OR REPLACE FUNCTION public.news_budget_reserve(p_id uuid, p_pipeline text, p_provider text, p_phase text, p_run_id text, p_micros bigint, p_priority boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  hour_cap bigint;
  shared_hour_cap bigint;
  pipeline_hour_cap bigint;
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
  -- Borrow only elapsed-day unused capacity for priority source reads/research.
  -- All daily/monthly/provider caps and the atomic reservation remain in force.
  hour_cap := case when p_priority then least(day_cap/4,
    greatest(day_cap/12, floor(day_cap*(extract(hour from now() at time zone 'UTC')+1)/24)-day_used+hour_used))
    else day_cap/12 end;
  shared_hour_cap := case when p_priority then floor(hour_cap*0.60) else day_cap/20 end;
  pipeline_hour_cap := shared_hour_cap;
  reason := case
    when not policy.enabled then 'budget_paused'
    when month_used+p_micros > month_cap then 'monthly_cap'
    when day_used+p_micros > day_cap then 'daily_cap'
    when hour_used+p_micros > hour_cap then 'hourly_pacing'
    when p_provider='x' and hour_x_used+p_micros > shared_hour_cap then 'hourly_research_reserve'
    when hour_pipeline_used+p_micros > pipeline_hour_cap then 'pipeline_hourly_share'
    when pipeline_used+p_micros > day_cap*0.60 then 'pipeline_daily_share'
    when p_provider='x' and x_used+p_micros > day_cap*0.60 then 'x_daily_share'
    when not p_priority and (day_used+p_micros > day_cap*0.80 or month_used+p_micros > month_cap*0.80 or (p_provider='x' and x_used+p_micros > day_cap*0.40)) then 'priority_reserve'
    else null end;
  if reason is not null then return jsonb_build_object('allowed',false,'reason',reason); end if;
  insert into public.news_cost_requests (id,pipeline,provider,phase,run_id,reserved_micros)
    values (p_id,p_pipeline,p_provider,left(p_phase,100),left(p_run_id,100),p_micros);
  return jsonb_build_object('allowed',true,'monthly_cap_micros',month_cap,'daily_cap_micros',day_cap);
end $function$

;

-- Retain the existing legacy path. New text-only and manually verified copies
-- have an explicit evidence and homepage-placement gate.
alter table public.articles drop constraint if exists articles_china_hot_editorial_minimum;
alter table public.articles add constraint articles_china_hot_editorial_minimum check (
 coalesce(automation_source,'') <> 'china-hot-li-teacher-v2'
 or coalesce(status,'') <> 'published'
 or coalesce(created_at < '2026-09-15T00:00:00Z'::timestamptz,false)
 or coalesce((
   metadata->>'manual_content_review'='true'
   and metadata->>'manual_facts_confirmed'='true'
   and metadata->>'manual_freshness_confirmed'='true'
   and length(coalesce(metadata->>'manual_verified_by','')) > 0
   and length(coalesce(metadata->>'manual_verification_note','')) >= 10
   and case when jsonb_typeof(metadata->'manual_evidence_urls')='array' then jsonb_array_length(metadata->'manual_evidence_urls') > 0 else false end
   and char_length(regexp_replace(regexp_replace(coalesce(content,''),'<[^>]*>','','g'),'[^㐀-鿿]','','g')) >= 50
   and (coalesce(cover_image,'') ~ '^https://[^[:space:]]+$' or metadata->>'homepage_focus_override'='exclude')
 ),false)
 or coalesce((
   (coalesce(cover_image,'') ~ '^https://[^[:space:]]+$'
    or (metadata->>'text_only_verified'='true'
      and metadata->>'editorial_policy_version'='unified-news-research-2000-3500-v2'
      and metadata->>'homepage_focus_override'='exclude'
      and metadata#>>'{editorial_review,single_event}'='true'
      and metadata#>>'{editorial_review,grounded}'='true'
      and metadata#>>'{editorial_review,sufficient}'='true'
      and metadata#>>'{editorial_review,source_chain_complete}'='true'
      and metadata#>>'{editorial_review,fresh_hot_event}'='true'
      and source_created_at between published_at-interval '12 hours' and published_at))
   and (
     char_length(regexp_replace(regexp_replace(coalesce(content,''),'<[^>]*>','','g'),'[^㐀-鿿]','','g')) >= 800
     or (
       char_length(regexp_replace(regexp_replace(coalesce(content,''),'<[^>]*>','','g'),'[^㐀-鿿]','','g')) > 0
       and metadata->>'publication_scope'='topic_only'
       and metadata->>'homepage_focus_override'='exclude'
       and metadata#>>'{editorial_review,single_event}'='true'
       and metadata#>>'{editorial_review,grounded}'='true'
       and metadata#>>'{editorial_review,sufficient}'='true'
       and (metadata#>>'{editorial_review,image_relevant}'='true' or metadata->>'text_only_verified'='true')
       and metadata#>>'{editorial_review,fresh_hot_event}'='true'
       and length(btrim(coalesce(metadata#>>'{editorial_review,freshness_evidence}',''))) > 0
       and metadata->>'appears_old_news'='false'
       and source_created_at <= published_at
       and source_created_at >= published_at - interval '72 hours'
       and (char_length(regexp_replace(regexp_replace(coalesce(content,''),'<[^>]*>','','g'),'[^㐀-鿿]','','g')) >= 300
         or metadata->>'context_research_attempted'='true')
     )
   )
 ),false)
) not valid;
