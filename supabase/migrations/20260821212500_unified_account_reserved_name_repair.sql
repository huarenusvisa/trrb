begin;

-- Some production databases predate the identity-defaults migration even
-- though later profile triggers still call this helper. Recreate it here so
-- new auth users can always be provisioned by handle_new_trrb_user().
create or replace function public.trrb_name_is_reserved(value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(coalesce(value, '')) ~ '(唐人日报|trrb|管理员|官方|客服|编辑部|版主|moderator|admin|administrator|support)'
$$;

commit;
