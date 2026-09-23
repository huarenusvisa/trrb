-- One transaction moves articles, verifies the move, then removes the category.
-- RLS remains in force; this RPC cannot elevate a caller's privileges.
create or replace function public.transfer_and_delete_category(source_id uuid, target_id uuid default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '5s'
set statement_timeout = '30s'
as $$
declare
  source_category public.categories%rowtype;
  target_category public.categories%rowtype;
  moved_count integer := 0;
  moved_ids uuid[];
  original_states jsonb;
begin
  -- Reuse the existing owner/admin predicate. Direct reads of admin_users
  -- recurse through its legacy self-referencing owner policy.
  if auth.uid() is null or not public.is_jobs_admin() then
    raise exception '没有栏目管理权限' using errcode = '42501';
  end if;
  if source_id is null or source_id = target_id then
    raise exception '请选择不同的目标栏目';
  end if;

  -- Prevent concurrent ingestion from attaching new articles during the move.
  lock table public.articles in share row exclusive mode;
  select * into source_category from public.categories where id = source_id for update;
  if not found then raise exception '原栏目不存在，请刷新'; end if;
  if target_id is not null then
    select * into target_category from public.categories where id = target_id and is_active = true for update;
    if not found then raise exception '目标栏目不存在或已停用'; end if;
  end if;
  if target_id is null and exists (
    select 1 from public.articles where category_id = source_id or category_name = source_category.name
  ) then
    raise exception '原栏目仍有文章，请选择目标栏目';
  end if;

  if target_id is not null then
    select array_agg(id) into moved_ids from public.articles
      where category_id = source_id or category_name = source_category.name;
    select jsonb_agg(jsonb_build_object('id',id,'status',status,'visibility',visibility,
      'published_at',published_at)) into original_states from public.articles where id = any(moved_ids);
    update public.articles
    set category_id = target_id,
        category_name = target_category.name,
        primary_section = target_category.slug,
        topic_key = case when target_category.slug = 'trump' then 'trump'
                         when target_category.slug = 'ice' then 'ice' else null end,
        metadata = (coalesce(metadata, '{}'::jsonb) - 'human_category_override') ||
          jsonb_build_object('human_category_override', target_category.name,
            'category_transfer', jsonb_build_object('from_id', source_id, 'from_name', source_category.name,
              'to_id', target_id, 'at', now(), 'actor', auth.uid()))
    where category_id = source_id or category_name = source_category.name;
    get diagnostics moved_count = row_count;
  end if;

  -- Classification triggers must not undo the requested move. Any error rolls
  -- back both the move and the deletion, including article version records.
  if exists (select 1 from public.articles where category_id = source_id or category_name = source_category.name) then
    raise exception '文章分类规则阻止了转移，原栏目已保留';
  end if;
  if exists (select 1 from public.articles where id = any(moved_ids)
      and (category_id is distinct from target_id or category_name is distinct from target_category.name)) then
    raise exception '部分文章未转入目标栏目，操作已撤销';
  end if;
  if exists (
    select 1 from public.articles a join jsonb_to_recordset(original_states)
      as previous(id uuid, status text, visibility text, published_at timestamptz) on a.id = previous.id
    where a.status is distinct from previous.status or a.visibility is distinct from previous.visibility
      or a.published_at is distinct from previous.published_at
  ) then
    raise exception '发布规则影响了文章原状态，操作已撤销，请先检查文章状态';
  end if;
  delete from public.categories where id = source_id;
  return jsonb_build_object('moved', moved_count, 'source', source_category.name, 'target', target_category.name);
end;
$$;
revoke all on function public.transfer_and_delete_category(uuid, uuid) from public, anon;
grant execute on function public.transfer_and_delete_category(uuid, uuid) to authenticated;
