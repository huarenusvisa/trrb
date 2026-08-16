begin;

create or replace function public.validate_trrb_profile_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.display_name := btrim(new.display_name);
  new.bio := btrim(coalesce(new.bio, ''));

  if char_length(new.display_name) < 2 or char_length(new.display_name) > 32 then
    raise exception 'display_name_length_invalid';
  end if;
  if public.trrb_name_is_reserved(new.display_name) then
    raise exception 'display_name_reserved';
  end if;
  if char_length(new.bio) > 240 then
    raise exception 'bio_length_invalid';
  end if;
  if new.avatar_key !~ '^avatar_(00[1-9]|0[1-9][0-9]|1[01][0-9]|120)$' then
    raise exception 'avatar_key_invalid';
  end if;

  if tg_op = 'UPDATE' then
    if new.display_name is distinct from old.display_name then new.is_custom_name := true; end if;
    if new.avatar_key is distinct from old.avatar_key then new.is_custom_avatar := true; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_validate_identity on public.profiles;
drop trigger if exists profiles_validate_settings on public.profiles;
create trigger profiles_validate_settings
before insert or update of display_name, avatar_key, bio on public.profiles
for each row execute procedure public.validate_trrb_profile_settings();

commit;
