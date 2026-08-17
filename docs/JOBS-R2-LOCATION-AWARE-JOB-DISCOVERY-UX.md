# JOBS-R2 — 定位感知招聘发现与极简展示

状态：ACTIVE
前置条件：JOBS-R1: 10/10 PASS
范围：仅美国；沿用JOBS-R1统一正式数据源、统一账号与/admin，不建立第二套招聘系统。

## 产品核心
不会打字、不熟悉美国地理、不愿开启定位的用户，也必须能快速找到工作。搜索框只是快捷入口，不是使用前提。系统优先利用登录账号最近一次已授权/已选择的找工位置自动推荐附近岗位；用户可随时切换ZIP、地区或全美。

## 固定10节点
1. 找工位置模型与账号同步：jobSearchLocation支持current_location/fixed_location/zip/region/all_us；保存经纬度、公开区域label、来源和更新时间；不得把找工位置表述为家庭住址。设备精确定位必须基于用户授权；IP仅作粗粒度首次推荐兜底。
2. PC极简找工头部：职位选择器 + 找工地点选择器 + 可选搜索框；登录且已有找工位置时默认直接展示附近职位；更换地点时提供当前位置、ZIP、选择地区、全美国；不增加不必要确认步骤。
3. 职位↔地区双向联动：先选厨师则展示有厨师岗位的地区及实时数量；先选地区则展示当地职位分类及数量；用户可全程只点选、不输入文字。
4. 地理认知降维：前台优先使用华人易理解的都会区/常用地区名称，后台保持State/City/County/Borough/Neighborhood标准化层级；支持纽约都会区、旧金山湾区等；避免要求用户理解美国行政区划。
5. 距离感知与附近工作：以授权坐标或用户选择的找工中心计算5/10/25/50 miles岗位；列表显示“距找工地点X miles”；地图路线能力可用时再显示驾车/公共交通时间，不得用不准确的IP距离冒充GPS距离。
6. PC高密度职位列表：默认一屏目标5–7条；视觉优先级为职位名称、薪资、距离/地点、关键条件、可信度、发布时间、立即沟通；长描述和完整标签移入详情；最多显示3–4个关键标签和+N；工作环境图片仅轻量提示/缩略，不以大图破坏扫描效率。
7. 手机极简职位流：顶部突出当前找工地点与更换；大分类点选；附近/推荐/最新/最近/高薪；职位卡适合拇指浏览，突出职位、薪资、距离、3–4关键标签、认证/评价、时间、收藏与聊一聊；复杂筛选收进“筛选”。
8. 列表/地图双模式与跨地区找工：地图可围绕找工中心显示岗位聚合，支持拖动到其他地区后“在这个区域找工作”；人在纽约也可固定旧金山湾区、长岛等作为找工中心；GPS不得锁死搜索范围。
9. Web/APP/账号/admin统一闭环：手机授权/选择的找工位置可随统一账号在PC继续使用，PC手动切换也可同步；用户可选择跟随当前位置或固定找工中心；/admin同步具备对应招聘、位置来源、状态和治理可见性；隐私、安全、反诈骗、评价与长期SEO规则继续继承JOBS-R1。
10. 生产总验收：PC、手机Web、APP、地图/距离、无定位、ZIP、手选地区、全美、双向联动、账号同步、admin、性能、隐私、SEO与回归全部重验；只有N1–N9严格PASS且日志明确输出 JOBS-R2: 10/10 PASS 才完成本轮。

## 界面硬规则
- 默认路径应尽量是：登录 → 已有授权/选择找工位置 → 自动出现附近工作；不要每次要求输入ZIP或地区。
- 用户拒绝定位时仍必须完整可用：ZIP、手选地区、全美均可找工作。
- 用户不需要会打字；职位分类和地区必须可点击完成完整找工流程。
- 用户不需要懂美国地理；距离比行政层级更重要。
- PC与手机共享数据和筛选状态，但不强求相同信息密度。
- PC强调快速扫描和比较；手机强调快速浏览和快速联系。
- 任何位置能力不得把“登录/注册”错误等同于获得GPS权限。
- 不强制采集精确家庭地址。

## 当前执行状态
- JOBS-R2-N1：PASS。代码证据：`supabase/migrations/20260817011000_jobs_r2_node1_search_location.sql`；审计：`scripts/audit-jobs-r2-node1.mjs`；GitHub Actions `JOBS-R2 Node 1` run 32044831791 = SUCCESS，并输出 `JOBS-R2-N1 PASS`。统一账号级 `job_search_locations` 支持 current_location/fixed_location/zip/region/all_us；设备GPS必须有授权时间戳；IP粗定位不得保存精确坐标；RLS仅允许本人读写。
- JOBS-R2-N2：PASS。代码证据：`jobs/search.html`、`jobs/search.js`、`supabase/migrations/20260817012000_jobs_r2_node2_pc_header.sql`；审计：`scripts/audit-jobs-r2-node2.mjs`；GitHub Actions `JOBS-R2 Node 2` run 32045152164 = SUCCESS。PC顶部已实现职位选择器、找工地点、可选文本搜索以及当前位置/ZIP/地区/全美四种入口，并沿用统一账号找工地点。
- JOBS-R2-N3：PASS。代码证据：`jobs/search-r2-discovery.js`、`supabase/migrations/20260817013000_jobs_r2_node3_bidirectional_counts.sql`；审计：`scripts/audit-jobs-r2-node3.mjs`；GitHub Actions `JOBS-R2 Node 3` run 32045174605 = SUCCESS。职位选择可反向展示有岗位州及数量，地区选择可反向展示当地职位分类及数量，均支持只点选不打字。
- JOBS-R2-N4：PASS。代码证据：`supabase/migrations/20260817014000_jobs_r2_node4_human_geo_areas.sql`、`jobs/search-r2-geo.js`；审计：`scripts/audit-jobs-r2-node4.mjs`；GitHub Actions `JOBS-R2 Node 4` run 32049026097 = SUCCESS。已建立不改变正式岗位数据源的 `job_discovery_areas` 人性化地区目录，覆盖纽约都会区、旧金山湾区等常见华人认知区域，并映射标准 State/City/County/Borough/Neighborhood。
- JOBS-R2-N5：PASS。代码证据：`jobs/search.js`、`jobs/search-r2-geo.js`、`supabase/migrations/20260817014000_jobs_r2_node4_human_geo_areas.sql`；审计：`scripts/audit-jobs-r2-node5.mjs`；GitHub Actions `JOBS-R2 Node 5` run 32058691703 = SUCCESS，并输出 `JOBS-R2-N5 PASS`。授权GPS坐标与用户主动点选的常用地区中心现统一接入5/10/25/50 miles半径、距离排序和“距找工地点”展示；手选地区不伪装GPS授权，拒绝定位仍保留ZIP/地区/全美路径，IP不用于伪造精确距离。
- JOBS-R2-N6：PASS。代码证据：`jobs/search.js`、`jobs/search-r2-geo.js`；审计：`scripts/audit-jobs-r2-node6.mjs`；GitHub Actions `JOBS-R2 Node 6` run 32059171070 = SUCCESS。PC职位列表已压缩为高密度卡片；职位名、薪资、地点/距离、4个以内关键标签、真实沟通评价/风险提示、发布时间及“查看并联系”成为首屏信息；不展示长描述或大图，也不制造虚假认证标识。
- JOBS-R2-N7：VERIFYING。正在将手机端收敛为位置优先、可点选分类、推荐/最新/最近/高薪切换、拇指友好的紧凑职位流，并保留收藏与站内沟通入口；复杂筛选继续收进“更多筛选”。

## 验收推进规则
开发可并行，PASS严格N1→N10串行。当前节点FAIL时主动诊断、做最小必要修复并重验；PASS后自动进入下一节点，不等待用户确认。真实外部BLOCKED才通知用户，并明确用户需要执行的最小动作。