begin;

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists cover_path text,
  add column if not exists is_private boolean not null default false,
  add column if not exists allow_message_requests boolean not null default true;

create table if not exists public.user_blocks (
  blocker_user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);
create index if not exists user_blocks_blocked_idx
  on public.user_blocks(blocked_user_id, blocker_user_id);

alter table public.user_blocks enable row level security;
drop policy if exists "blocks owner read" on public.user_blocks;
create policy "blocks owner read" on public.user_blocks
  for select to authenticated using ((select auth.uid()) = blocker_user_id);
drop policy if exists "blocks owner insert" on public.user_blocks;
create policy "blocks owner insert" on public.user_blocks
  for insert to authenticated with check ((select auth.uid()) = blocker_user_id);
drop policy if exists "blocks owner delete" on public.user_blocks;
create policy "blocks owner delete" on public.user_blocks
  for delete to authenticated using ((select auth.uid()) = blocker_user_id);

revoke all on public.user_blocks from anon, authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant select, insert, update, delete on public.user_blocks to service_role;

create or replace function private.users_are_blocked(p_first uuid, p_second uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_user_id = p_first and b.blocked_user_id = p_second)
       or (b.blocker_user_id = p_second and b.blocked_user_id = p_first)
  )
$$;
revoke all on function private.users_are_blocked(uuid, uuid) from public;
grant execute on function private.users_are_blocked(uuid, uuid) to anon, authenticated, service_role;

alter table public.user_follows
  add column if not exists status text not null default 'accepted',
  add column if not exists accepted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.user_follows
set status = 'accepted', accepted_at = coalesce(accepted_at, created_at), updated_at = now()
where status is distinct from 'accepted' or accepted_at is null;

alter table public.user_follows drop constraint if exists user_follows_status_check;
alter table public.user_follows
  add constraint user_follows_status_check check (status in ('pending', 'accepted'));

create index if not exists user_follows_followed_status_idx
  on public.user_follows(followed_user_id, status, created_at desc);
create index if not exists user_follows_follower_status_idx
  on public.user_follows(follower_user_id, status, created_at desc);

create or replace function private.guard_user_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_private boolean;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or auth.uid() <> new.follower_user_id then
      raise exception 'follow_identity_mismatch' using errcode = '42501';
    end if;
    if new.follower_user_id = new.followed_user_id then
      raise exception 'cannot_follow_self' using errcode = '23514';
    end if;
    if private.users_are_blocked(new.follower_user_id, new.followed_user_id) then
      raise exception 'follow_blocked' using errcode = '42501';
    end if;
    select p.is_private into target_private
    from public.profiles p
    where p.id = new.followed_user_id and p.status = 'active';
    if not found then
      raise exception 'profile_unavailable' using errcode = '23503';
    end if;
    new.status := case when target_private then 'pending' else 'accepted' end;
    new.accepted_at := case when target_private then null else now() end;
    new.updated_at := now();
    return new;
  end if;

  if auth.uid() is null or auth.uid() <> old.followed_user_id then
    raise exception 'follow_request_owner_required' using errcode = '42501';
  end if;
  if new.follower_user_id <> old.follower_user_id
     or new.followed_user_id <> old.followed_user_id
     or old.status <> 'pending'
     or new.status <> 'accepted' then
    raise exception 'invalid_follow_transition' using errcode = '42501';
  end if;
  if private.users_are_blocked(new.follower_user_id, new.followed_user_id) then
    raise exception 'follow_blocked' using errcode = '42501';
  end if;
  new.accepted_at := now();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.guard_user_follow() from public, anon, authenticated;

drop trigger if exists trg_guard_user_follow on public.user_follows;
create trigger trg_guard_user_follow
before insert or update on public.user_follows
for each row execute function private.guard_user_follow();

drop policy if exists "follow graph readable" on public.user_follows;
drop policy if exists "accepted follow graph public read" on public.user_follows;
drop policy if exists "users create own follows" on public.user_follows;
drop policy if exists "users delete own follows" on public.user_follows;
drop policy if exists "users update received follow requests" on public.user_follows;
create policy "follow graph readable" on public.user_follows
  for select to authenticated
  using (
    status = 'accepted'
    or (select auth.uid()) in (follower_user_id, followed_user_id)
  );
create policy "accepted follow graph public read" on public.user_follows
  for select to anon using (status = 'accepted');
create policy "users create own follows" on public.user_follows
  for insert to authenticated
  with check ((select auth.uid()) = follower_user_id);
create policy "users accept received follow requests" on public.user_follows
  for update to authenticated
  using ((select auth.uid()) = followed_user_id and status = 'pending')
  with check ((select auth.uid()) = followed_user_id and status = 'accepted');
create policy "participants delete follows" on public.user_follows
  for delete to authenticated
  using ((select auth.uid()) in (follower_user_id, followed_user_id));

revoke all on public.user_follows from anon, authenticated;
grant select on public.user_follows to anon;
grant select, insert, delete on public.user_follows to authenticated;
grant update(status) on public.user_follows to authenticated;
grant select, insert, update, delete on public.user_follows to service_role;

alter table public.user_notifications drop constraint if exists user_notifications_type_check;
alter table public.user_notifications
  add constraint user_notifications_type_check check (
    type in (
      'comment_reply', 'comment_like', 'follow', 'follow_request', 'follow_accept',
      'message_request', 'message', 'system'
    )
  );

create or replace function public.notify_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.user_notifications(user_id, actor_user_id, type, title)
    values(
      new.followed_user_id,
      new.follower_user_id,
      case when new.status = 'pending' then 'follow_request' else 'follow' end,
      case when new.status = 'pending' then '你有新的关注申请' else '你有新的关注者' end
    );
  elsif old.status = 'pending' and new.status = 'accepted' then
    insert into public.user_notifications(user_id, actor_user_id, type, title)
    values(new.follower_user_id, new.followed_user_id, 'follow_accept', '你的关注申请已通过');
  end if;
  return new;
end;
$$;
revoke all on function public.notify_follow() from public, anon, authenticated;

drop trigger if exists trg_notify_follow on public.user_follows;
create trigger trg_notify_follow
after insert or update of status on public.user_follows
for each row execute function public.notify_follow();

create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'blocked')),
  accepted_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_user_id <> recipient_user_id)
);
create unique index if not exists direct_conversations_pair_unique
  on public.direct_conversations(
    least(requester_user_id, recipient_user_id),
    greatest(requester_user_id, recipient_user_id)
  );
create index if not exists direct_conversations_requester_idx
  on public.direct_conversations(requester_user_id, last_message_at desc nulls last);
create index if not exists direct_conversations_recipient_idx
  on public.direct_conversations(recipient_user_id, last_message_at desc nulls last);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists direct_messages_conversation_created_idx
  on public.direct_messages(conversation_id, created_at asc);
create index if not exists direct_messages_unread_idx
  on public.direct_messages(conversation_id, read_at, created_at desc)
  where read_at is null;
create index if not exists direct_messages_sender_idx
  on public.direct_messages(sender_user_id, created_at desc);

alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;

create or replace function private.guard_direct_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requests_allowed boolean;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or auth.uid() <> new.requester_user_id then
      raise exception 'conversation_identity_mismatch' using errcode = '42501';
    end if;
    if new.requester_user_id = new.recipient_user_id then
      raise exception 'cannot_message_self' using errcode = '23514';
    end if;
    if private.users_are_blocked(new.requester_user_id, new.recipient_user_id) then
      raise exception 'conversation_blocked' using errcode = '42501';
    end if;
    select p.allow_message_requests into requests_allowed
    from public.profiles p
    where p.id = new.recipient_user_id and p.status = 'active';
    if not found or not requests_allowed then
      raise exception 'message_requests_disabled' using errcode = '42501';
    end if;
    new.status := 'pending';
    new.accepted_at := null;
    new.last_message_at := null;
    new.updated_at := now();
    return new;
  end if;

  if pg_trigger_depth() > 1
     and new.requester_user_id = old.requester_user_id
     and new.recipient_user_id = old.recipient_user_id
     and (
       new.status = old.status
       or (new.status = 'blocked' and old.status in ('pending', 'accepted'))
     ) then
    new.updated_at := now();
    return new;
  end if;

  if auth.uid() is null or auth.uid() <> old.recipient_user_id then
    raise exception 'conversation_recipient_required' using errcode = '42501';
  end if;
  if new.requester_user_id <> old.requester_user_id
     or new.recipient_user_id <> old.recipient_user_id
     or old.status <> 'pending'
     or new.status not in ('accepted', 'declined') then
    raise exception 'invalid_conversation_transition' using errcode = '42501';
  end if;
  if private.users_are_blocked(new.requester_user_id, new.recipient_user_id) then
    raise exception 'conversation_blocked' using errcode = '42501';
  end if;
  new.accepted_at := case when new.status = 'accepted' then now() else null end;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.guard_direct_conversation() from public, anon, authenticated;

drop trigger if exists trg_guard_direct_conversation on public.direct_conversations;
create trigger trg_guard_direct_conversation
before insert or update on public.direct_conversations
for each row execute function private.guard_direct_conversation();

create or replace function private.guard_direct_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  convo public.direct_conversations%rowtype;
begin
  if auth.uid() is null or auth.uid() <> new.sender_user_id then
    raise exception 'message_identity_mismatch' using errcode = '42501';
  end if;
  select * into convo
  from public.direct_conversations c
  where c.id = new.conversation_id
  for update;
  if not found or new.sender_user_id not in (convo.requester_user_id, convo.recipient_user_id) then
    raise exception 'conversation_unavailable' using errcode = '42501';
  end if;
  if private.users_are_blocked(convo.requester_user_id, convo.recipient_user_id)
     or convo.status in ('blocked', 'declined') then
    raise exception 'conversation_blocked' using errcode = '42501';
  end if;
  if convo.status = 'pending' then
    if new.sender_user_id <> convo.requester_user_id then
      raise exception 'confirm_chat_before_reply' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.direct_messages m
      where m.conversation_id = new.conversation_id
    ) then
      raise exception 'waiting_for_chat_confirmation' using errcode = '42501';
    end if;
  elsif convo.status <> 'accepted' then
    raise exception 'conversation_unavailable' using errcode = '42501';
  end if;
  update public.direct_conversations
  set last_message_at = now(), updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;
revoke all on function private.guard_direct_message() from public, anon, authenticated;

drop trigger if exists trg_guard_direct_message on public.direct_messages;
create trigger trg_guard_direct_message
before insert on public.direct_messages
for each row execute function private.guard_direct_message();

drop policy if exists "conversation participants read" on public.direct_conversations;
create policy "conversation participants read" on public.direct_conversations
  for select to authenticated
  using ((select auth.uid()) in (requester_user_id, recipient_user_id));
drop policy if exists "users create message requests" on public.direct_conversations;
create policy "users create message requests" on public.direct_conversations
  for insert to authenticated
  with check ((select auth.uid()) = requester_user_id);
drop policy if exists "recipients answer message requests" on public.direct_conversations;
create policy "recipients answer message requests" on public.direct_conversations
  for update to authenticated
  using ((select auth.uid()) = recipient_user_id and status = 'pending')
  with check ((select auth.uid()) = recipient_user_id and status in ('accepted', 'declined'));

drop policy if exists "conversation messages read" on public.direct_messages;
create policy "conversation messages read" on public.direct_messages
  for select to authenticated
  using (exists (
    select 1 from public.direct_conversations c
    where c.id = conversation_id
      and (select auth.uid()) in (c.requester_user_id, c.recipient_user_id)
  ));
drop policy if exists "conversation messages send" on public.direct_messages;
create policy "conversation messages send" on public.direct_messages
  for insert to authenticated
  with check (
    (select auth.uid()) = sender_user_id
    and exists (
      select 1 from public.direct_conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.requester_user_id, c.recipient_user_id)
    )
  );
drop policy if exists "recipients mark messages read" on public.direct_messages;
create policy "recipients mark messages read" on public.direct_messages
  for update to authenticated
  using (
    sender_user_id <> (select auth.uid())
    and exists (
      select 1 from public.direct_conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.requester_user_id, c.recipient_user_id)
    )
  )
  with check (
    sender_user_id <> (select auth.uid())
    and exists (
      select 1 from public.direct_conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.requester_user_id, c.recipient_user_id)
    )
  );

revoke all on public.direct_conversations from anon, authenticated;
grant select, insert on public.direct_conversations to authenticated;
grant update(status) on public.direct_conversations to authenticated;
grant select, insert, update, delete on public.direct_conversations to service_role;
revoke all on public.direct_messages from anon, authenticated;
grant select, insert on public.direct_messages to authenticated;
grant update(read_at) on public.direct_messages to authenticated;
grant select, insert, update, delete on public.direct_messages to service_role;

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
  select * into convo from public.direct_conversations where id = new.conversation_id;
  target_user := case
    when new.sender_user_id = convo.requester_user_id then convo.recipient_user_id
    else convo.requester_user_id
  end;
  insert into public.user_notifications(user_id, actor_user_id, type, title, body)
  values(
    target_user,
    new.sender_user_id,
    case when convo.status = 'pending' then 'message_request' else 'message' end,
    case when convo.status = 'pending' then '你收到一条聊天申请' else '你收到一条新私信' end,
    left(new.body, 120)
  );
  return new;
end;
$$;
revoke all on function private.notify_direct_message() from public, anon, authenticated;

drop trigger if exists trg_notify_direct_message on public.direct_messages;
create trigger trg_notify_direct_message
after insert on public.direct_messages
for each row execute function private.notify_direct_message();

create or replace function private.apply_user_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_follows f
  where (f.follower_user_id = new.blocker_user_id and f.followed_user_id = new.blocked_user_id)
     or (f.follower_user_id = new.blocked_user_id and f.followed_user_id = new.blocker_user_id);
  update public.direct_conversations c
  set status = 'blocked', updated_at = now()
  where c.status in ('pending', 'accepted')
    and (
      (c.requester_user_id = new.blocker_user_id and c.recipient_user_id = new.blocked_user_id)
      or (c.requester_user_id = new.blocked_user_id and c.recipient_user_id = new.blocker_user_id)
    );
  return new;
end;
$$;
revoke all on function private.apply_user_block() from public, anon, authenticated;

drop trigger if exists trg_apply_user_block on public.user_blocks;
create trigger trg_apply_user_block
after insert on public.user_blocks
for each row execute function private.apply_user_block();

create table if not exists public.profile_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 2000),
  status text not null default 'published' check (status in ('published', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profile_posts_user_created_idx
  on public.profile_posts(user_id, status, created_at desc);

create table if not exists public.profile_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.profile_posts(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  storage_path text not null unique,
  mime_type text not null,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  sort_order smallint not null default 0 check (sort_order between 0 and 8),
  created_at timestamptz not null default now(),
  unique(post_id, sort_order)
);
create index if not exists profile_post_media_post_idx
  on public.profile_post_media(post_id, sort_order);
create index if not exists profile_post_media_owner_idx
  on public.profile_post_media(owner_user_id, created_at desc);

create or replace function private.guard_profile_post_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_owner uuid;
  existing_count integer;
  existing_video boolean;
begin
  if auth.uid() is null or auth.uid() <> new.owner_user_id then
    raise exception 'profile_media_identity_mismatch' using errcode = '42501';
  end if;
  select pp.user_id into post_owner
  from public.profile_posts pp
  where pp.id = new.post_id and pp.status = 'published'
  for update;
  if not found or post_owner <> new.owner_user_id then
    raise exception 'profile_post_unavailable' using errcode = '42501';
  end if;
  select count(*), coalesce(bool_or(pm.media_type = 'video'), false)
  into existing_count, existing_video
  from public.profile_post_media pm
  where pm.post_id = new.post_id;
  if existing_count >= 4 then
    raise exception 'profile_media_limit_reached' using errcode = '23514';
  end if;
  if new.media_type = 'video' and (existing_count > 0 or existing_video) then
    raise exception 'one_video_per_post' using errcode = '23514';
  end if;
  if new.media_type = 'image' and existing_video then
    raise exception 'cannot_mix_video_and_images' using errcode = '23514';
  end if;
  if new.media_type = 'image' and new.mime_type not like 'image/%' then
    raise exception 'invalid_image_mime' using errcode = '23514';
  end if;
  if new.media_type = 'video' and new.mime_type not like 'video/%' then
    raise exception 'invalid_video_mime' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_profile_post_media() from public, anon, authenticated;

drop trigger if exists trg_guard_profile_post_media on public.profile_post_media;
create trigger trg_guard_profile_post_media
before insert on public.profile_post_media
for each row execute function private.guard_profile_post_media();

create or replace function private.can_view_profile_post(p_post_id uuid, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profile_posts pp
    join public.profiles p on p.id = pp.user_id
    where pp.id = p_post_id
      and pp.status = 'published'
      and p.status = 'active'
      and (
        p_viewer = pp.user_id
        or (
          not private.users_are_blocked(p_viewer, pp.user_id)
          and (
            not p.is_private
            or exists (
              select 1 from public.user_follows f
              where f.follower_user_id = p_viewer
                and f.followed_user_id = pp.user_id
                and f.status = 'accepted'
            )
          )
        )
      )
  )
$$;
revoke all on function private.can_view_profile_post(uuid, uuid) from public;
grant execute on function private.can_view_profile_post(uuid, uuid) to anon, authenticated, service_role;

alter table public.profile_posts enable row level security;
alter table public.profile_post_media enable row level security;

drop policy if exists "visible profile posts read" on public.profile_posts;
create policy "visible profile posts read" on public.profile_posts
  for select to anon, authenticated
  using (private.can_view_profile_post(id, (select auth.uid())) or (select auth.uid()) = user_id);
drop policy if exists "owners create profile posts" on public.profile_posts;
create policy "owners create profile posts" on public.profile_posts
  for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'published');
drop policy if exists "owners delete profile posts" on public.profile_posts;
create policy "owners delete profile posts" on public.profile_posts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and status = 'deleted');

drop policy if exists "visible profile media read" on public.profile_post_media;
create policy "visible profile media read" on public.profile_post_media
  for select to anon, authenticated
  using (private.can_view_profile_post(post_id, (select auth.uid())) or (select auth.uid()) = owner_user_id);
drop policy if exists "owners create profile media" on public.profile_post_media;
create policy "owners create profile media" on public.profile_post_media
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_user_id
    and exists (
      select 1 from public.profile_posts pp
      where pp.id = post_id and pp.user_id = (select auth.uid())
    )
  );
drop policy if exists "owners delete profile media" on public.profile_post_media;
create policy "owners delete profile media" on public.profile_post_media
  for delete to authenticated using ((select auth.uid()) = owner_user_id);

revoke all on public.profile_posts from anon, authenticated;
grant select on public.profile_posts to anon, authenticated;
grant insert on public.profile_posts to authenticated;
grant update(status) on public.profile_posts to authenticated;
grant select, insert, update, delete on public.profile_posts to service_role;
revoke all on public.profile_post_media from anon, authenticated;
grant select on public.profile_post_media to anon, authenticated;
grant insert, delete on public.profile_post_media to authenticated;
grant select, insert, update, delete on public.profile_post_media to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media', 'profile-media', true, 12582912,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict(id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-post-media', 'profile-post-media', false, 83886080,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict(id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile media public read" on storage.objects;
create policy "profile media public read" on storage.objects
  for select to public using (bucket_id = 'profile-media');
drop policy if exists "profile media owner insert" on storage.objects;
create policy "profile media owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "profile media owner update" on storage.objects;
create policy "profile media owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "profile media owner delete" on storage.objects;
create policy "profile media owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "profile post media visible read" on storage.objects;
create policy "profile post media visible read" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'profile-post-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.profile_post_media pm
        where pm.storage_path = name
          and private.can_view_profile_post(pm.post_id, (select auth.uid()))
      )
    )
  );
drop policy if exists "profile post media owner insert" on storage.objects;
create policy "profile post media owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-post-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "profile post media owner update" on storage.objects;
create policy "profile post media owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-post-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-post-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "profile post media owner delete" on storage.objects;
create policy "profile post media owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-post-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "profiles public read" on public.profiles;
create policy "profiles public read" on public.profiles
  for select to public
  using (
    (status = 'active' or (select auth.uid()) = id)
    and (
      (select auth.uid()) is null
      or (select auth.uid()) = id
      or not private.users_are_blocked((select auth.uid()), id)
    )
  );

revoke update on public.profiles from anon, authenticated;
grant select(id, display_name, avatar_key, avatar_path, cover_path, bio, status, is_private, allow_message_requests)
  on public.profiles to anon, authenticated;
grant update(display_name, avatar_key, avatar_path, cover_path, bio, is_custom_name, is_custom_avatar, is_private, allow_message_requests, updated_at)
  on public.profiles to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_conversations'
  ) then
    alter publication supabase_realtime add table public.direct_conversations;
  end if;
end $$;

commit;
