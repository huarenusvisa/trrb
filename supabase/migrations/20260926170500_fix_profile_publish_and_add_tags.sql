begin;

create or replace function public.is_trrb_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
      and is_active = true
      and role = 'owner'
  );
$$;

revoke all on function public.is_trrb_owner() from public;
grant execute on function public.is_trrb_owner() to authenticated, service_role;

drop policy if exists "Owners can manage admin users" on public.admin_users;
create policy "Owners can manage admin users" on public.admin_users
  for all to authenticated
  using (public.is_trrb_owner())
  with check (public.is_trrb_owner());

alter table public.profile_posts
  add column if not exists tags text[] not null default '{}'::text[];

alter table public.profile_posts
  drop constraint if exists profile_posts_tags_count_check;
alter table public.profile_posts
  add constraint profile_posts_tags_count_check
  check (cardinality(tags) <= 8);

grant insert on public.profile_posts to authenticated;
grant select on public.profile_posts to anon, authenticated;
grant select, insert, update, delete on public.profile_posts to service_role;

commit;