-- Align production control labels with the safer robot topology.
update public.automation_controls
set
  display_name = 'ICE夜间安全维护',
  description = '仅在夜间恢复卡死任务、清理过期候选、过滤回复、合并重复事件和清理孤立媒体；不重分类普通文章。'
where control_key = 'maintenance';

update public.automation_controls
set
  display_name = '旧站404手动盘点',
  description = '一次性人工盘点旧链接和404问题；只生成报告，不修改文章，完成后自动恢复为关闭。'
where control_key = 'legacy_404';

update public.automation_controls
set
  description = '自动向IndexNow提交新内容，并与Google/Bing提交和SEO监控组合运行。'
where control_key = 'seo_indexnow';

update public.automation_controls
set
  display_name = 'Google/Bing搜索引擎提交',
  description = '向Google Search Console和Bing Webmaster提交站点地图、检查抓取与索引状态。'
where control_key = 'seo_search_engine';

update public.automation_controls
set
  display_name = '线上SEO健康监控',
  description = '检查线上页面、404、元数据和SEO完整性。'
where control_key = 'monitor';
