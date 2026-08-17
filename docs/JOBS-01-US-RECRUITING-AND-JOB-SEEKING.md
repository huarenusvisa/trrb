# JOBS-01 — 美国招聘求职第一批

状态：ACTIVE
统一编号：JOBS-R1
范围：仅美国（United States only）
工程线：JOBS，独立于 APP-BATCH 与 LEGAL-ROUND。

## 总原则
- 首页原“庇护百科”区域整体替换为“招聘求职”。
- 原庇护百科内容不得丢失：按发布内容类型自动回归“移民美国”对应类目（哪里来的回哪里）。
- 发布端极简，求职端强大。
- 一个统一账号可同时拥有 employer/jobSeeker 角色，activeRole 可在设置切换；角色标签不等于认证。
- 仅允许美国境内招聘/求职；国家固定 US，不提供其他国家入口。
- 点击发布即适用平台发布规则，不增加额外勾选或二次确认阻碍。
- **PC/Web 前端公开上线与 /admin 管理必须同闭环完成**：任何招聘求职功能一旦对公众上线，对应 /admin 必须同时能够查看同一正式数据源的数据、识别发布者与状态，并执行与该阶段功能匹配的管理/治理操作；不得先上前台后补后台。
- 数据库、Web 前端、APP 与 /admin 必须使用同一正式数据源和统一账号体系；不得建立第二套招聘后台、影子数据或平行账号。

## 固定10节点
1. 美国招聘/求职数据模型、统一账号多角色、岗位/求职生命周期与稳定永久ID。
2. 首页原“庇护百科”完整迁移：旧内容自动按类型回归“移民美国”类目；原位置替换为招聘求职双入口。
3. 求职搜索：全美国→州→城市→County/Borough→Neighborhood；支持关键词、行业、全/兼职、薪资与综合/最新/距离排序。
4. 地理与附近岗位：授权定位后支持5/10/25/50 miles；拒绝定位仍可手选地区；岗位保存标准化地点与经纬度；支持列表/地图模式。
5. 极简招聘发布：职位、地点、薪资可选、工作介绍、类型、主要联系方式；工作环境图片可选；可编辑。
6. 求职者档案/求职发布：头像可选（无则默认头像）、经历、自我介绍、目标岗位/地区；本人可主动公开电话/Email或仅站内联系；禁止公开高敏感身份/金融信息。
7. 联系闭环：Web与APP站内消息同步；电话、短信、Email快捷联系；聊天绑定具体岗位；联系方式采用渐进式设置，默认不增加复杂勾选。
8. 真实联系后的评价与反诈骗：contactEvent后站内邀请评价；沟通评分、信息一致度、薪资/内容一致性、风险标签；涉嫌诈骗可一键举报；雇主可回复/申诉；公众匿名可选但平台账户可追溯。
9. 生命周期、SEO与治理：招聘中/已招满/暂停/下架/重新上架/删除；求职中/已找到/暂停/下架/重新上架/删除。未主动删除的历史页面长期保留稳定URL并明确“已结束”，不混入当前招聘搜索；删除公开内容不清除必要举报/处罚/反欺诈记录；防重复刷屏、过期提醒、图片隐私/版权、举报审核。
10. Web + APP + 移动端 + SEO + 安全 + 性能生产总验收，只有全部严格PASS才输出 JOBS-R1: 10/10 PASS。

## 招聘分类初始集合
餐饮；美甲/美容；按摩；装修/建筑；物流/仓库；卡车/司机；超市/零售；家政/护理；律师/法律；会计/金融；地产；教育；IT/科技；办公室/行政；销售；其他。

## 搜索与地点硬规则
- 纽约示例层级必须正确表达：New York → New York City → Queens → Flushing/Bayside/Elmhurst/Jackson Heights/Astoria；Brooklyn → Sunset Park/Bensonhurst/Bay Ridge 等。
- 不把 Queens/Brooklyn 与 Flushing/Bayside 混成同一行政层级。
- IP只能作为粗粒度兜底，不能作为精确社区定位；附近岗位优先使用用户授权的设备位置。

## 图片与真实性
- 雇主可选上传工作环境照片，无图片仍可正常发布与正常排序。
- 图片不等于平台真实性认证；“雇主上传图片”“手机/Email验证”“企业认证”必须分开表达。
- 上传处理需移除不必要EXIF精确位置，并提供图片/岗位举报。

## 评价与历史硬规则
- 评价与举报不能由被评价方通过删除岗位一键洗掉。
- 下架/关闭/已招满后评价保留；重新上架继续关联原岗位历史。
- 发布者可申请复核/删除不实、侵权、隐私泄露或违规评价，由平台按规则处理。
- 岗位历史公开与平台安全记录分层；必要安全记录不因账号/岗位删除自动消失。

## 当前执行状态
- JOBS-R1-N1：PASS。代码证据：`supabase/migrations/20260817001000_jobs_r1_node1_foundation.sql`；审计：`scripts/audit-jobs-r1-node1.mjs`；GitHub Actions `JOBS-R1 Node 1` run 31993475474 = SUCCESS，日志标准为 `JOBS-R1-N1 PASS`。
- JOBS-R1-N2：PASS。代码证据：`supabase/migrations/20260817002000_jobs_r1_node2_home_admin_migration.sql`、`jobs/index.html`、`admin/jobs-manager.js`；审计：`scripts/audit-jobs-r1-node2.mjs`；GitHub Actions `JOBS-R1 Node 2` run 32013769498 = SUCCESS。
- JOBS-R1-N3：RUNNING。当前代码：`supabase/migrations/20260817003000_jobs_r1_node3_search.sql`、`jobs/search.html`、`jobs/search.js`；审计：`scripts/audit-jobs-r1-node3.mjs`；GitHub Actions `JOBS-R1 Node 3` 正在执行严格验收。
- JOBS-R1-N4：WAITING。
- JOBS-R1-N5：WAITING。
- JOBS-R1-N6：WAITING。
- JOBS-R1-N7：WAITING。
- JOBS-R1-N8：WAITING。
- JOBS-R1-N9：WAITING。
- JOBS-R1-N10：WAITING。
