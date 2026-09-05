begin;

-- Message pushes are useful promptly, but a busy conversation should not alert
-- every worker cycle. Pending rows remain in the existing queue and are claimed
-- together as a summary after this per-recipient, per-conversation cooldown.
create index if not exists user_notifications_recent_message_push_idx
  on public.user_notifications(user_id, conversation_id, push_sent_at desc)
  where push_status = 'sent'
    and type in ('message_request', 'message');

create index if not exists user_notifications_processing_message_push_idx
  on public.user_notifications(user_id, conversation_id, push_attempted_at desc)
  where push_status = 'processing'
    and type in ('message_request', 'message');

create or replace function public.claim_interaction_push_notifications(
  p_claim_id uuid,
  p_limit integer default 100
)
returns table (
  id bigint,
  user_id uuid,
  actor_user_id uuid,
  type text,
  title text,
  body text,
  article_id text,
  comment_id uuid,
  community_post_id uuid,
  community_comment_id uuid,
  conversation_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Serialize only the short database claim transaction. The following query
  -- receives a fresh READ COMMITTED snapshot after the lock, so another worker
  -- cannot split a large conversation into a second simultaneous claim.
  perform pg_catalog.pg_advisory_xact_lock(831779096050945::bigint);

  return query
  with read_skipped as (
    update public.user_notifications as notification
    set push_status = 'skipped',
        push_claim_id = null,
        push_error = 'read_before_push'
    where notification.push_status = 'pending'
      and notification.is_read = true
      and notification.type in (
        'comment_reply', 'comment_like', 'community_reply', 'community_post_like',
        'community_comment_like', 'community_report', 'follow', 'follow_request',
        'follow_accept', 'message_request', 'message'
      )
    returning notification.id
  ), candidates as (
    select notification.id
    from public.user_notifications as notification
    where notification.push_status = 'pending'
      and notification.is_read = false
      and notification.type in (
        'comment_reply', 'comment_like', 'community_reply', 'community_post_like',
        'community_comment_like', 'community_report', 'follow', 'follow_request',
        'follow_accept', 'message_request', 'message'
      )
      and (
        notification.type not in ('message_request', 'message')
        or not exists (
          select 1
          from public.user_notifications as blocker
          where blocker.user_id = notification.user_id
            and blocker.conversation_id is not distinct from notification.conversation_id
            and blocker.type in ('message_request', 'message')
            and blocker.id <> notification.id
            and (
              (blocker.push_status = 'processing'
                and blocker.push_attempted_at > now() - interval '30 minutes')
              or (blocker.push_status = 'sent'
                and blocker.push_sent_at > now() - interval '30 minutes')
            )
        )
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
    returning notification.id, notification.user_id, notification.actor_user_id,
      notification.type, notification.title, notification.body,
      notification.article_id, notification.comment_id,
      notification.community_post_id, notification.community_comment_id,
      notification.conversation_id
  )
  select claimed.* from claimed
  left join (select count(*) as skipped_count from read_skipped) as skipped on true;
end;
$$;

revoke all on function public.claim_interaction_push_notifications(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_interaction_push_notifications(uuid, integer)
  to service_role;

comment on function public.claim_interaction_push_notifications(uuid, integer) is
  'Service-only atomic push claim with a 30-minute direct-message conversation cooldown';

commit;
