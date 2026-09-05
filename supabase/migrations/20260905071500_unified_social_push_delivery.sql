begin;

alter table public.user_notifications
  add column if not exists conversation_id uuid
    references public.direct_conversations(id) on delete set null;

drop index if exists public.user_notifications_pending_community_push_idx;
create index if not exists user_notifications_pending_interaction_push_idx
  on public.user_notifications(created_at, id)
  where push_status = 'pending'
    and type in (
      'comment_reply', 'comment_like', 'community_reply', 'community_post_like',
      'community_comment_like', 'community_report', 'follow', 'follow_request',
      'follow_accept', 'message_request', 'message'
    );

drop function if exists public.claim_community_push_notifications(uuid, integer);
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
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select notification.id
    from public.user_notifications as notification
    where notification.push_status = 'pending'
      and notification.type in (
        'comment_reply', 'comment_like', 'community_reply', 'community_post_like',
        'community_comment_like', 'community_report', 'follow', 'follow_request',
        'follow_accept', 'message_request', 'message'
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
  select * from claimed;
$$;

revoke all on function public.claim_interaction_push_notifications(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_interaction_push_notifications(uuid, integer)
  to service_role;

create or replace function private.notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  convo public.direct_conversations%rowtype;
  target_user uuid;
begin
  select * into convo
  from public.direct_conversations
  where id = new.conversation_id;

  target_user := case
    when new.sender_user_id = convo.requester_user_id then convo.recipient_user_id
    else convo.requester_user_id
  end;

  insert into public.user_notifications(
    user_id, actor_user_id, type, title, body, conversation_id
  ) values (
    target_user,
    new.sender_user_id,
    case when convo.status = 'pending' then 'message_request' else 'message' end,
    case when convo.status = 'pending' then '你收到一条聊天申请' else '你收到一条新私信' end,
    left(new.body, 120),
    new.conversation_id
  );
  return new;
end;
$$;

revoke all on function private.notify_direct_message() from public, anon, authenticated;

commit;
