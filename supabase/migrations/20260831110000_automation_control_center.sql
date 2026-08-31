begin;

create table if not exists public.automation_controls (
  control_key text primary key,
  display_name text not null,
  enabled boolean not null default false,
  description text not null default '',
  sort_order integer not null default 100,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.automation_controls enable row level security;

drop policy if exists "automation controls admin read" on public.automation_controls;
create policy "automation controls admin read" on public.automation_controls
  for select to authenticated using (public.is_jobs_admin());

drop policy if exists "automation controls admin update" on public.automation_controls;
create policy "automation controls admin update" on public.automation_controls
  for update to authenticated using (public.is_jobs_admin())
  with check (public.is_jobs_admin());

revoke all on public.automation_controls from anon;
grant select, update on public.automation_controls to authenticated;
grant select, insert, update on public.automation_controls to service_role;

insert into public.automation_controls(control_key, display_name, enabled, description, sort_order)
values
  ('global', '全部机器人总开关', false, '关闭时所有定时、手动和被调用流程都必须停止。', 0),
  ('ice', 'ICE采集与发布', false, 'ICE统一采集、编辑、审核与发布链路。', 10),
  ('china_hot', '中国热门头条', false, '中国热门头条采集、编辑、发布及CHRT同步。', 20),
  ('trump_x', '特朗普X资讯', false, '特朗普本人X内容采集与发布。', 30),
  ('jobs', '招聘抓取', false, '华人工作网招聘来源采集与写入。', 40),
  ('secondhand', '二手交易抓取', false, '二手商品来源采集与写入。', 50),
  ('seo_indexnow', 'IndexNow提交', false, '向支持IndexNow的搜索引擎提交新网址。', 60),
  ('seo_search_engine', 'Google/Bing SEO', false, 'Search Console、Bing和搜索引擎诊断提交。', 70),
  ('monitor', 'SEO与线上监控', false, '线上抓取、SEO完整性和健康检查。', 80),
  ('maintenance', 'ICE维护清理', false, 'ICE夜间维护和孤立媒体清理。', 90),
  ('legacy_404', '旧站迁移/404只读盘点', false, '只读盘点旧归档、301和404，不允许自动恢复。', 100),
  ('seo_metadata', 'SEO元数据人工任务', false, '人工触发的SEO元数据同步。', 110),
  ('legacy_recovery', '旧站恢复人工任务', false, '人工触发的旧站恢复任务。', 120)
on conflict (control_key) do update
set display_name = excluded.display_name,
    description = excluded.description,
    sort_order = excluded.sort_order;

comment on table public.automation_controls is
  'Fail-closed control plane for every TRRB scheduled or manually dispatched automation. The global row and module row must both be enabled.';

commit;
