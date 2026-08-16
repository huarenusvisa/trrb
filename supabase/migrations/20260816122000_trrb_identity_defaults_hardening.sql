begin;

create or replace function public.random_trrb_name()
returns text
language plpgsql
set search_path = public
as $$
declare
  tones text[] := array['清风','星河','远山','云海','晨光','晚霞','松风','秋水','长街','微光','北辰','南枝','春山','听海','晴川','白露','青禾','木棉','流云','拾光','月影','夏木','冬雪','朝霞','青岚','霁月','浅溪','竹影','海棠','长风','云帆','青石'];
  scenes text[] := array['听雨','观海','望川','追光','看云','寻星','踏雪','逐浪','听松','看山','问月','拾叶','临风','看潮','望月','听泉','寻鹿','看霞','逐风','听溪','观星','寻梦','望海','拾光','看雪','听潮','行云','望山','看花','听竹','临溪','观澜'];
  roles text[] := array['旅人','行舟','山客','远客','归雁','飞鸟','小鹿','云舟','星语','朝露','小满','知秋','青鸟','林客','月客','寻光者'];
  candidate text;
  i int;
begin
  for i in 1..40 loop
    candidate := tones[1+floor(random()*array_length(tones,1))::int]
      || scenes[1+floor(random()*array_length(scenes,1))::int]
      || roles[1+floor(random()*array_length(roles,1))::int];
    if not exists(select 1 from public.profiles p where lower(p.display_name)=lower(candidate)) then
      return candidate;
    end if;
  end loop;
  return '星河寻光者' || lpad((floor(random()*1000000)::int)::text,6,'0');
end;
$$;

create or replace function public.trrb_name_is_reserved(value text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(value,'')) ~ '(唐人日报|trrb|管理员|官方|客服|编辑部|版主|moderator|admin|administrator|support)'
$$;

create or replace function public.validate_trrb_profile_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.display_name := btrim(new.display_name);
  if char_length(new.display_name) < 2 or char_length(new.display_name) > 32 then
    raise exception 'display_name_length_invalid';
  end if;
  if public.trrb_name_is_reserved(new.display_name) then
    raise exception 'display_name_reserved';
  end if;
  if tg_op = 'UPDATE' then
    if new.display_name is distinct from old.display_name then new.is_custom_name := true; end if;
    if new.avatar_key is distinct from old.avatar_key then new.is_custom_avatar := true; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_validate_identity on public.profiles;
create trigger profiles_validate_identity
before insert or update of display_name, avatar_key on public.profiles
for each row execute procedure public.validate_trrb_profile_identity();

commit;
