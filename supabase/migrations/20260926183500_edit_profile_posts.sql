begin;

create or replace function public.update_my_profile_post(
  p_post_id uuid,
  p_caption text,
  p_tags text[]
)
returns public.profile_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_post public.profile_posts%rowtype;
  v_tags text[];
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  select * into v_post
  from public.profile_posts
  where id = p_post_id
    and user_id = v_user_id
    and status = 'published'
  for update;

  if not found then
    raise exception 'profile_post_unavailable' using errcode='42501';
  end if;

  select coalesce(array_agg(tag), '{}'::text[])
  into v_tags
  from (
    select distinct btrim(regexp_replace(raw, '^#+', '')) as tag
    from unnest(coalesce(p_tags, '{}'::text[])) raw
    where char_length(btrim(regexp_replace(raw, '^#+', ''))) between 1 and 24
    limit 5
  ) q;

  update public.profile_posts
  set caption = left(coalesce(p_caption,''), 2000),
      tags = v_tags,
      updated_at = now()
  where id = p_post_id
  returning * into v_post;

  return v_post;
end;
$$;

revoke all on function public.update_my_profile_post(uuid,text,text[]) from public, anon;
grant execute on function public.update_my_profile_post(uuid,text,text[]) to authenticated, service_role;

commit;