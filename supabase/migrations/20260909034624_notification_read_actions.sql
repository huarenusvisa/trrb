begin;

create or replace function public.mark_my_notification_read(p_notification_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_notifications
  set is_read = true
  where id = p_notification_id
    and user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.mark_my_notifications_read(p_category text default 'all')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer := 0;
begin
  if p_category not in ('all', 'replies', 'likes', 'follows', 'messages', 'moderation') then
    raise exception 'invalid_notification_category';
  end if;
  update public.user_notifications
  set is_read = true
  where user_id = auth.uid()
    and is_read = false
    and (
      p_category = 'all'
      or (p_category = 'replies' and type = any(array['comment_reply', 'community_reply']))
      or (p_category = 'likes' and type = any(array['comment_like', 'community_post_like', 'community_comment_like']))
      or (p_category = 'follows' and type = any(array['follow', 'follow_request', 'follow_accept']))
      or (p_category = 'messages' and type = any(array['message_request', 'message']))
      or (p_category = 'moderation' and type = any(array['community_report', 'system']))
    );
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.mark_my_notification_read(bigint) from public;
revoke all on function public.mark_my_notifications_read(text) from public;
grant execute on function public.mark_my_notification_read(bigint) to authenticated, service_role;
grant execute on function public.mark_my_notifications_read(text) to authenticated, service_role;

commit;
