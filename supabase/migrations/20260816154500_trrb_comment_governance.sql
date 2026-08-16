begin;

create index if not exists comment_reports_status_created_idx on public.comment_reports(status, created_at desc);
create index if not exists moderation_actions_created_idx on public.moderation_actions(created_at desc);

create or replace function public.guard_trrb_interaction_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  actor_status text;
begin
  actor := auth.uid();
  if actor is null then
    raise exception 'authentication required';
  end if;

  select status into actor_status from public.profiles where id = actor;
  if actor_status is distinct from 'active' then
    raise exception 'account is not allowed to interact';
  end if;

  if tg_table_name = 'comment_likes' and new.user_id <> actor then
    raise exception 'like actor mismatch';
  end if;
  if tg_table_name = 'comment_reports' and new.reporter_user_id <> actor then
    raise exception 'report actor mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_trrb_like_actor_trigger on public.comment_likes;
create trigger guard_trrb_like_actor_trigger before insert on public.comment_likes
for each row execute function public.guard_trrb_interaction_actor();

drop trigger if exists guard_trrb_report_actor_trigger on public.comment_reports;
create trigger guard_trrb_report_actor_trigger before insert on public.comment_reports
for each row execute function public.guard_trrb_interaction_actor();

create or replace function public.guard_trrb_comment_post_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
  actor_status text;
begin
  if auth.uid() is null or auth.uid() <> new.user_id then
    raise exception 'comment author mismatch';
  end if;
  select status into actor_status from public.profiles where id = new.user_id;
  if actor_status is distinct from 'active' then
    raise exception 'account is not allowed to comment';
  end if;
  select count(*) into recent_count
  from public.comments
  where user_id = new.user_id and created_at > now() - interval '1 minute';
  if recent_count >= 8 then
    raise exception 'comment rate limit exceeded';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_trrb_comment_post_rate_trigger on public.comments;
create trigger guard_trrb_comment_post_rate_trigger before insert on public.comments
for each row execute function public.guard_trrb_comment_post_rate();

create or replace function public.guard_trrb_report_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
  from public.comment_reports
  where reporter_user_id = new.reporter_user_id and created_at > now() - interval '10 minutes';
  if recent_count >= 20 then
    raise exception 'report rate limit exceeded';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_trrb_report_rate_trigger on public.comment_reports;
create trigger guard_trrb_report_rate_trigger before insert on public.comment_reports
for each row execute function public.guard_trrb_report_rate();

-- Moderator/admin changes must be auditable via trusted server-side paths.
create or replace function public.log_trrb_comment_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status is distinct from old.status or new.is_pinned is distinct from old.is_pinned)
     and auth.uid() is distinct from old.user_id then
    insert into public.moderation_actions(actor_user_id,target_user_id,comment_id,action,reason)
    values(auth.uid(), old.user_id, old.id,
      case when new.status is distinct from old.status then 'comment_status:'||new.status else 'comment_pin:'||new.is_pinned::text end,
      'automatic audit record');
  end if;
  return new;
end;
$$;

drop trigger if exists log_trrb_comment_moderation_trigger on public.comments;
create trigger log_trrb_comment_moderation_trigger after update on public.comments
for each row execute function public.log_trrb_comment_moderation();

commit;
