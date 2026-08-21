begin;

-- notification_preferences is not present in every deployment of the shared
-- account database. Profile provisioning must succeed with or without it.
create or replace function public.handle_new_trrb_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_name text;
begin
  account_name := public.trrb_unique_account_name(
    new.raw_user_meta_data ->> 'display_name',
    new.email,
    new.phone
  );
  insert into public.profiles(id, display_name, avatar_key, is_custom_name, is_custom_avatar)
  values(new.id, account_name, public.trrb_initial_avatar_key(account_name), false, false)
  on conflict(id) do nothing;
  if to_regclass('public.notification_preferences') is not null then
    execute 'insert into public.notification_preferences(user_id) values($1) on conflict(user_id) do nothing'
      using new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.handle_new_trrb_user() from public, anon, authenticated;

commit;
