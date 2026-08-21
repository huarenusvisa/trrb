begin;

drop trigger if exists on_auth_user_created_jobs_bootstrap on auth.users;
drop function if exists public.handle_new_trrb_user_jobs_bootstrap();

drop trigger if exists on_auth_user_created_trrb on auth.users;
create trigger on_auth_user_created_trrb
  after insert on auth.users
  for each row execute procedure public.handle_new_trrb_user();

revoke all on function public.handle_new_trrb_user() from public, anon, authenticated;

commit;
