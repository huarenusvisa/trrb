-- Cover the direct-message notification foreign key and exact chat deep-link lookups.
create index if not exists user_notifications_conversation_idx
  on public.user_notifications (conversation_id)
  where conversation_id is not null;
