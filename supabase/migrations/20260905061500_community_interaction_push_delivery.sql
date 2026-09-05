begin;

alter table public.user_notifications
  add column if not exists push_status text,
  add column if not exists push_claim_id uuid,
  add column if not exists push_attempted_at timestamptz,
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_error text;

-- Do not turn historical in-app notifications into a push backlog. Only rows
-- created after this migration should enter the delivery queue.
update public.user_notifications
set push_status = 'skipped', push_error = 'created_before_push_delivery'
where push_status is null;

alter table public.user_notifications
  alter column push_status set default 'pending',
  alter column push_status set not null;

alter table public.user_notifications
  drop constraint if exists user_notifications_push_status_check;
alter table public.user_notifications
  add constraint user_notifications_push_status_check
  check (push_status in ('pending', 'processing', 'sent', 'skipped', 'failed'));

create index if not exists user_notifications_pending_community_push_idx
  on public.user_notifications(created_at, id)
  where push_status = 'pending'
    and type in ('community_reply', 'community_post_like', 'community_comment_like', 'community_report');

alter table public.push_ticket_receipts
  add column if not exists notification_id bigint
    references public.user_notifications(id) on delete set null;

create index if not exists push_ticket_receipts_notification_idx
  on public.push_ticket_receipts(notification_id)
  where notification_id is not null;

create or replace function public.claim_community_push_notifications(
  p_claim_id uuid,
  p_limit integer default 100
)
returns table (
  id bigint,
  user_id uuid,
  type text,
  title text,
  body text,
  community_post_id uuid,
  community_comment_id uuid
)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select notification.id
    from public.user_notifications as notification
    where notification.push_status = 'pending'
      and notification.type in (
        'community_reply', 'community_post_like',
        'community_comment_like', 'community_report'
      )
    order by notification.created_at, notification.id
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
    for update skip locked
  ), claimed as (
    update public.user_notifications as notification
    set push_status = 'processing',
        push_claim_id = p_claim_id,
        push_attempted_at = now(),
        push_error = null
    from candidates
    where notification.id = candidates.id
    returning notification.id, notification.user_id, notification.type,
      notification.title, notification.body, notification.community_post_id,
      notification.community_comment_id
  )
  select * from claimed;
$$;

revoke all on function public.claim_community_push_notifications(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_community_push_notifications(uuid, integer)
  to service_role;

-- Client updates remain limited to is_read. These delivery columns are operated
-- only by the server-side service role through the existing RLS-protected table.

commit;
