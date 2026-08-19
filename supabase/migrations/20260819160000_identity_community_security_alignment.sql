begin;

-- Existing Auth users predate the community/profile migration in production.
-- Backfill them before tightening profile/comment permissions so every current
-- account has the same profile/preferences foundation as future registrations.
insert into public.profiles(id,display_name,avatar_key,bio,is_custom_name,is_custom_avatar,role,status)
select
  u.id,
  '唐人用户' || substr(replace(u.id::text,'-',''),1,8),
  'avatar_' || lpad((1 + (abs(hashtext(u.id::text)) % 120))::text,3,'0'),
  '',false,false,'user','active'
from auth.users u
where not exists (select 1 from public.profiles p where p.id=u.id)
on conflict(id) do nothing;

insert into public.notification_preferences(user_id)
select p.id from public.profiles p
where not exists (select 1 from public.notification_preferences n where n.user_id=p.id)
on conflict(user_id) do nothing;

-- Keep notification preference columns aligned with the current mobile app and
-- admin push service. Older environments may already have legal_updates and
-- comment_replies from the foundation migration; preserve those columns but
-- add/migrate the current legal/community fields idempotently.
alter table if exists public.notification_preferences
  add column if not exists legal boolean not null default true,
  add column if not exists community boolean not null default true;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notification_preferences' and column_name='legal_updates'
  ) then
    execute 'update public.notification_preferences set legal = legal_updates where legal_updates is not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='notification_preferences' and column_name='comment_replies'
  ) then
    execute 'update public.notification_preferences set community = comment_replies where comment_replies is not null';
  end if;
end $$;

-- push_delivery_log was originally drafted with bigint article_id while the
-- production articles.id type is uuid. Convert safely and preserve any already
-- valid UUID-like historical values if this migration is run in an environment
-- where the old table already exists.
do $$
declare
  current_type text;
begin
  if to_regclass('public.push_delivery_log') is not null then
    select data_type into current_type
    from information_schema.columns
    where table_schema='public' and table_name='push_delivery_log' and column_name='article_id';
    if current_type is distinct from 'uuid' then
      alter table public.push_delivery_log add column if not exists article_id_uuid uuid;
      update public.push_delivery_log
      set article_id_uuid = case
        when article_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then article_id::text::uuid
        else null
      end;
      alter table public.push_delivery_log drop column article_id;
      alter table public.push_delivery_log rename column article_id_uuid to article_id;
    end if;
  end if;
end $$;

-- Users may edit only public profile presentation fields. They must never be
-- able to self-promote role or undo a moderator-imposed status restriction.
drop policy if exists "profiles owner update" on public.profiles;
create policy "profiles owner update" on public.profiles
  for update using (auth.uid()=id) with check (auth.uid()=id);
revoke update on public.profiles from anon, authenticated;
grant update(display_name,avatar_key,bio,is_custom_name,is_custom_avatar,updated_at)
  on public.profiles to authenticated;

-- Comment authors do not receive generic UPDATE access. Generic row update
-- would let a user restore a hidden comment or set is_pinned=true. Deletion is
-- exposed only through the narrow RPC below.
drop policy if exists "comments owner update" on public.comments;
drop policy if exists "comments owner insert" on public.comments;
create policy "comments owner insert" on public.comments
  for insert with check (
    auth.uid()=user_id
    and is_pinned=false
    and status in ('published','pending')
  );
revoke update on public.comments from anon, authenticated;

create or replace function public.delete_own_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  changed integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  update public.comments
  set status='deleted', content='[已删除]', is_pinned=false, updated_at=now()
  where id=p_comment_id and user_id=auth.uid();
  get diagnostics changed = row_count;
  return changed=1;
end;
$$;
revoke all on function public.delete_own_comment(uuid) from public, anon;
grant execute on function public.delete_own_comment(uuid) to authenticated;

-- Ensure the current push preference columns remain protected by the same
-- owner-only RLS semantics after schema alignment.
alter table public.notification_preferences enable row level security;
drop policy if exists "users read own notification preferences" on public.notification_preferences;
create policy "users read own notification preferences" on public.notification_preferences
  for select using (auth.uid()=user_id);
drop policy if exists "users manage own notification preferences" on public.notification_preferences;
create policy "users manage own notification preferences" on public.notification_preferences
  for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

commit;
