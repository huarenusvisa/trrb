alter table public.direct_messages
  drop constraint if exists direct_messages_attachment_owner_path_check;

alter table public.direct_messages
  add constraint direct_messages_attachment_owner_path_check check (
    attachment_path is null
    or attachment_path like conversation_id::text || '/' || sender_user_id::text || '/%'
  );
