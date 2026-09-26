begin;

alter table public.profile_posts
  add column if not exists comment_count integer not null default 0;

create table if not exists public.profile_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.profile_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 3000),
  status text not null default 'published' check (status in ('published','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profile_post_comments_post_created_idx
  on public.profile_post_comments(post_id, created_at asc);
create index if not exists profile_post_comments_user_created_idx
  on public.profile_post_comments(user_id, created_at desc);

alter table public.profile_post_comments enable row level security;

drop policy if exists "visible profile post comments read" on public.profile_post_comments;
create policy "visible profile post comments read" on public.profile_post_comments
  for select to anon, authenticated
  using (
    status='published'
    and private.can_view_profile_post(post_id, (select auth.uid()))
  );

drop policy if exists "users create profile post comments" on public.profile_post_comments;
create policy "users create profile post comments" on public.profile_post_comments
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and private.can_view_profile_post(post_id, (select auth.uid()))
  );

drop policy if exists "owners delete profile post comments" on public.profile_post_comments;
create policy "owners delete profile post comments" on public.profile_post_comments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and status='deleted');

revoke all on public.profile_post_comments from anon, authenticated;
grant select on public.profile_post_comments to anon, authenticated;
grant insert on public.profile_post_comments to authenticated;
grant update(status, updated_at) on public.profile_post_comments to authenticated;
grant select, insert, update, delete on public.profile_post_comments to service_role;

create or replace function public.create_profile_post_comment(p_post_id uuid, p_content text)
returns public.profile_post_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_comment public.profile_post_comments%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(p_content,''))) < 1 then
    raise exception 'comment_required' using errcode='23514';
  end if;
  if not private.can_view_profile_post(p_post_id, v_user_id) then
    raise exception 'profile_post_unavailable' using errcode='42501';
  end if;

  insert into public.profile_post_comments(post_id,user_id,content)
  values(p_post_id,v_user_id,left(btrim(p_content),3000))
  returning * into v_comment;

  update public.profile_posts
  set comment_count = comment_count + 1, updated_at = now()
  where id = p_post_id;

  return v_comment;
end;
$$;

revoke all on function public.create_profile_post_comment(uuid,text) from public, anon;
grant execute on function public.create_profile_post_comment(uuid,text) to authenticated, service_role;

create or replace function public.delete_my_profile_post_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post_id uuid;
begin
  update public.profile_post_comments
  set status='deleted', updated_at=now()
  where id=p_comment_id and user_id=v_user_id and status='published'
  returning post_id into v_post_id;

  if v_post_id is not null then
    update public.profile_posts
    set comment_count = greatest(comment_count - 1,0), updated_at=now()
    where id=v_post_id;
  end if;
end;
$$;

revoke all on function public.delete_my_profile_post_comment(uuid) from public, anon;
grant execute on function public.delete_my_profile_post_comment(uuid) to authenticated, service_role;

commit;