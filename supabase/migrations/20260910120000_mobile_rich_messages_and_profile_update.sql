alter table public.direct_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size bigint,
  add column if not exists attachment_duration_ms integer,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.direct_messages
  drop constraint if exists direct_messages_message_type_check;
alter table public.direct_messages
  add constraint direct_messages_message_type_check
  check (message_type in ('text', 'image', 'video', 'file', 'audio', 'call'));

alter table public.direct_messages
  drop constraint if exists direct_messages_attachment_shape_check;
alter table public.direct_messages
  add constraint direct_messages_attachment_shape_check check (
    (message_type in ('text', 'call') and attachment_path is null)
    or
    (message_type in ('image', 'video', 'file', 'audio')
      and attachment_path is not null
      and attachment_mime is not null
      and attachment_size between 1 and 12582912)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'direct-message-media',
  'direct-message-media',
  false,
  12582912,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mp4', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/3gpp', 'audio/wav',
    'application/pdf', 'text/plain', 'application/zip',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.update_my_profile(
  p_display_name text,
  p_bio text,
  p_avatar_key text,
  p_avatar_path text,
  p_cover_path text,
  p_is_private boolean,
  p_allow_message_requests boolean
)
returns setof public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_display_name, ''));
  v_bio text := btrim(coalesce(p_bio, ''));
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 32 then raise exception 'invalid_display_name'; end if;
  if char_length(v_bio) > 240 then raise exception 'bio_too_long'; end if;
  if p_avatar_path is not null and p_avatar_path not like v_user_id::text || '/avatar/%' then
    raise exception 'invalid_avatar_path';
  end if;
  if p_cover_path is not null and p_cover_path not like v_user_id::text || '/cover/%' then
    raise exception 'invalid_cover_path';
  end if;

  return query
  update public.profiles
  set display_name = v_name,
      bio = v_bio,
      avatar_key = nullif(btrim(coalesce(p_avatar_key, '')), ''),
      avatar_path = p_avatar_path,
      cover_path = p_cover_path,
      is_custom_name = true,
      is_custom_avatar = p_avatar_path is not null,
      is_private = coalesce(p_is_private, false),
      allow_message_requests = coalesce(p_allow_message_requests, true),
      updated_at = now()
  where id = v_user_id
  returning *;
end;
$$;

revoke all on function public.update_my_profile(text, text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.update_my_profile(text, text, text, text, text, boolean, boolean) to authenticated, service_role;

grant select, insert on public.direct_messages to authenticated;
grant select, insert, update, delete on public.direct_messages to service_role;
