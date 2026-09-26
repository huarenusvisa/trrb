-- Additive schema for simple community posts. Existing posts and profile media are untouched.
set lock_timeout='5s';
alter table public.community_posts add column if not exists media jsonb not null default '[]'::jsonb;
alter table public.community_posts add constraint community_posts_media_array_check check (case when jsonb_typeof(media)='array' then jsonb_array_length(media)<=9 else false end);
alter table public.community_posts drop constraint community_posts_content_check;
alter table public.community_posts add constraint community_posts_content_check check (char_length(content)<=12000 and (char_length(btrim(content))>=1 or jsonb_array_length(media)>0));
create index community_posts_media_lookup on public.community_posts using gin (media jsonb_path_ops) where media <> '[]'::jsonb;

create or replace function private.validate_community_post_media()
returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; obj jsonb; file_path text; actual_mime text; actual_size bigint; result jsonb='[]'::jsonb; video_count int=0; n int=0; ext text;
begin
  if tg_op='UPDATE' and new.media=old.media and new.id=old.id and new.user_id=old.user_id then return new; end if;
  if jsonb_typeof(new.media)<>'array' or jsonb_array_length(new.media)>9 then raise exception '媒体列表无效：最多9张图片或1个视频'; end if;
  for item in select value from jsonb_array_elements(new.media) loop
    file_path=item->>'storage_path';
    if file_path is null or file_path not like new.user_id::text||'/'||new.id::text||'/%' or file_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|webm)$' then raise exception '媒体必须属于当前账号及当前帖子'; end if;
    if result @> jsonb_build_array(jsonb_build_object('storage_path',file_path)) then raise exception '同一文件不能重复添加'; end if;
    select metadata into obj from storage.objects where bucket_id='community-post-media' and name=file_path for share;
    if obj is null then raise exception '文件尚未上传完成，请重新上传'; end if;
    actual_mime=lower(coalesce(obj->>'mimetype',''));
    if coalesce(obj->>'size','') !~ '^[0-9]{1,10}$' then raise exception '无法核实上传文件大小'; end if;
    actual_size=(obj->>'size')::bigint;
    if actual_size<=0 or actual_size>12582912 then raise exception '图片或视频不能超过12 MB，文件大小由存储系统核验'; end if;
    ext=case actual_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'video/mp4' then 'mp4' when 'video/quicktime' then 'mov' when 'video/webm' then 'webm' else null end;
    if ext is null or right(file_path,length(ext)+1)<>'.'||ext then raise exception '不支持的媒体格式'; end if;
    if actual_mime like 'video/%' then video_count=video_count+1; end if;
    result=result||jsonb_build_array(jsonb_build_object('storage_path',file_path,'media_type',case when actual_mime like 'video/%' then 'video' else 'image' end,'mime_type',actual_mime,'size_bytes',actual_size,'sort_order',n));
    n=n+1;
  end loop;
  if video_count>0 and n<>1 then raise exception '每次仅可发布1个视频，不能与图片混合'; end if;
  new.media=result;
  return new;
end $$;
revoke all on function private.validate_community_post_media() from public;
create trigger validate_community_post_media before insert or update of media,user_id,id on public.community_posts for each row execute function private.validate_community_post_media();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('community-post-media','community-post-media',false,12582912,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function private.community_media_can_read(p_path text,p_viewer uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select ((split_part(p_path,'/',1)=p_viewer::text)
    or exists(select 1 from public.admin_users a where a.user_id=p_viewer and a.is_active)
    or exists(select 1 from public.community_posts p join public.profiles a on a.id=p.user_id
      where p.status='published' and a.status='active' and p.media @> jsonb_build_array(jsonb_build_object('storage_path',p_path))
        and (not coalesce(a.is_private,false) or exists(select 1 from public.user_follows f where f.follower_user_id=p_viewer and f.followed_user_id=p.user_id and f.status='accepted'))
        and not exists(select 1 from public.user_blocks b where (b.blocker_user_id=p_viewer and b.blocked_user_id=p.user_id) or (b.blocker_user_id=p.user_id and b.blocked_user_id=p_viewer)))) is true;
$$;
create or replace function private.community_media_is_attached(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.community_posts p where p.status<>'deleted' and p.media @> jsonb_build_array(jsonb_build_object('storage_path',p_path)));
$$;
revoke all on function private.community_media_can_read(text,uuid) from public;
revoke all on function private.community_media_is_attached(text) from public;
grant execute on function private.community_media_can_read(text,uuid) to anon,authenticated,service_role;
grant execute on function private.community_media_is_attached(text) to authenticated,service_role;

create policy "community media owner upload" on storage.objects for insert to authenticated
with check(bucket_id='community-post-media' and (storage.foldername(name))[1]=(select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|webm)$'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.status='active'));
create policy "community media visible read" on storage.objects for select to anon,authenticated
using(bucket_id='community-post-media' and private.community_media_can_read(name,(select auth.uid())));
-- No UPDATE policy: published objects cannot be replaced after validation.
create policy "community media unused owner cleanup" on storage.objects for delete to authenticated
using(bucket_id='community-post-media' and (storage.foldername(name))[1]=(select auth.uid())::text and not private.community_media_is_attached(name));
notify pgrst,'reload schema';
