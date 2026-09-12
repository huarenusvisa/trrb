begin;

delete from public.automation_controls
where control_key = 'legacy_404';

update public.automation_controls
set display_name = '唐人日报后台夜间安全维护',
    description = '每晚自动检查唐人日报后台、任务队列和数据库并执行安全清理；ICE维护为内部步骤。',
    enabled = true,
    updated_at = now()
where control_key = 'maintenance';

update public.automation_controls
set enabled = true,
    updated_at = now()
where control_key in ('global', 'seo_indexnow', 'seo_search_engine', 'monitor');

commit;
