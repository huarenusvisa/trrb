# 唐人日报 ICE“随手拍”完整开发包 v2

## 已按最终流程开发

ICE执法追踪页面右上角：

`📷 随手拍`

点击后弹窗字段：

- 日期
- 地点
- 事件
- 照片／视频
- 联系方式

提交链路：

`前台弹窗 → Netlify Function → Supabase ice_user_reports → status=draft → 管理员审核 → 发布为 articles 新闻`

## 与历史版本相比的修复

历史版本已经存在 `report.js`、`report.css`、`submit-ice-report.js`、审核页面和SQL，但存在以下问题：

1. 没有真正上传照片/视频。
2. 后台审核页写着“你的Supabase地址/anon key”，不能直接使用。
3. 审核接口没有管理员身份验证。
4. 浏览器提交的 `status` 会被服务器原样写入，有被绕过审核的风险。
5. 原始素材没有私有存储，联系方式和素材隔离不足。
6. 发布动作只改报告状态，没有生成前台文章。

v2 已改为：

- 原始照片/视频存入私有 Storage Bucket。
- 浏览器仅获得2小时有效的签名上传地址。
- Netlify服务端强制写入 `status=draft`。
- 管理员审核接口验证Supabase登录和 `admin_users` 权限。
- 审核通过时复制素材到公开Bucket，并写入 `articles` 表。
- 联系方式只在管理员审核页显示，不进入公开文章。
- 同一IP默认6小时最多提交5次，最多准备20个上传文件。
- 支持最多5个文件；图片15MB/个，视频80MB/个。
- 拒绝必须填写理由，重复发布会自动识别。

## 文件覆盖/新增

直接按目录上传压缩包内文件：

- `topic/ice/index.html`（覆盖）
- `topic/ice/report.css`（新增）
- `topic/ice/report.js`（新增）
- `netlify/functions/ice-report.js`（新增）
- `netlify/functions/ice-report-review.js`（新增）
- `admin/ice-report-review/index.html`（新增）
- `admin/ice-report-review/style.css`（新增）
- `admin/ice-report-review/app.js`（新增）
- `admin/ADD-SNAPSHOT-NAV.html`（可选：主后台侧栏入口代码）
- `SUPABASE-ICE-REPORT-V2.sql`（新增）

## 必须执行的上线步骤

### 1. Supabase

打开 Supabase Dashboard：

`SQL Editor → New query`

完整运行：

`SUPABASE-ICE-REPORT-V2.sql`

运行成功后会建立：

- `ice_user_reports`
- `ice_report_upload_tokens`（上传签名与滥用控制）
- `ice-report-private` 私有Bucket
- `ice-report-public` 公开Bucket

### 2. Netlify环境变量

确认已有：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

建议新增一个随机长字符串：

- `ICE_REPORT_HASH_SECRET`

可选覆盖Bucket名称：

- `ICE_REPORT_PRIVATE_BUCKET=ice-report-private`
- `ICE_REPORT_PUBLIC_BUCKET=ice-report-public`

### 3. 重新部署

上传到GitHub后等待Netlify部署完成。

### 4. 测试前台

打开：

`https://trrb.net/topic/ice/`

点击右上角：

`📷 随手拍`

提交一条测试线索。页面应显示“提交成功”和提交编号。

### 5. 管理员审核

打开：

`https://trrb.net/admin/ice-report-review/`

使用现有唐人日报后台管理员账号登录。

审核页支持：

- 查看日期、地点、原始事件
- 查看提交者联系方式（不公开）
- 查看照片和视频
- 编辑标题、摘要、正文
- 选择封面
- 保存为审核中
- 拒绝
- 审核通过并立即发布

## 发布后的结果

审核发布后：

- `ice_user_reports.status = published`
- `ice_user_reports.article_id` 写入文章ID
- `articles.status = published`
- `articles.topic_key = ice`
- `articles.source_platform = user_report`
- ICE前台实时列表会从Supabase读取并显示这篇文章

## 验收检查

1. 未登录不能访问审核数据。
2. 前端提交后数据库状态只能是 `draft`。
3. 私有Bucket中的原始素材不能通过普通公开URL读取。
4. 管理员可以看到照片/视频和联系方式。
5. 点击发布后生成 `articles` 记录。
6. ICE页面出现已发布新闻。
7. 重复点击发布不会生成第二篇重复文章。

## 可选：加入主后台侧栏入口

打开 `admin/ADD-SNAPSHOT-NAV.html`，将其中一行放到现有 `admin/index.html` 的侧栏 `<nav>` 内。审核页面本身不依赖此入口，直接访问 `/admin/ice-report-review/` 即可。
