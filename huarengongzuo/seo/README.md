# 华人工作网独立 SEO 任务清单

此目录只提供数据与本地构建产物，不运行定时任务，不调用 Google、Bing、IndexNow，也不修改总 SEO 调度。

- `public-jobs-snapshot.json`：一次完整的公开岗位只读快照，仅包含公开岗位 ID 和更新时间。更新时必须完整读取 `status=open AND moderation_hold=false AND deleted_at IS NULL`，不能用截断列表代替。
- `previous-snapshot.json`：上一次完整构建快照，供本次完整快照比较变更。
- `current-snapshot.json`：本次全部公开 canonical URL、指纹和更新时间。
- `tasks.json`：供总 SEO 机器人读取的独立任务清单，`dispatch=false`。`add/update/delete` 为普通网页 URL 变更，**不代表符合 Google Indexing API 或 JobPosting 要求**。搜索引擎渠道由总机器人自行判断。

从仓库根目录手动运行 `node scripts/build-huarengongzuo-seo.mjs` 会生成当前快照、静态 sitemap 和任务清单。不会自动运行，也不覆盖基线。总机器人完成消费后，可将当次完整快照保存为下一次基线；任务 ID 稳定，可用于去重。首次没有基线时只输出 add，不猜测 delete。不完整快照会被拒绝，以防误发删除。

2026-09-23 完整快照含 5,432 个公开岗位、29 个固定入口。来源为线上数据库生成的 sitemap；已核对 `x-hg-sitemap: public-jobs-v2` 和 `x-hg-sitemap-jobs` 总数，确认不是静态降级文件。其中也包括仍为公开状态的过期页面；过期页面显示到期提示且不输出有效招聘结构化数据。草稿、审核暂停和删除的岗位不公开。

发布前需刷新数据快照并重新生成任务清单。固定入口从线上 sitemap 的同一份路由定义读取，新增城市或职业时不再受旧的13条数量限制。构建不会自动提交搜索引擎；提交仍由总SEO机器人负责。
