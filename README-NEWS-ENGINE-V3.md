# 唐人日报 V3 新闻引擎部署说明

本版本保持主页布局不变，升级 ICE、驱逐快报、特朗普动态和现有 Supabase 后台。

## 已实现

- ICE 抓捕/拘留新闻继续进入 `/topic/ice/`；只有明确人数、地点和事件日期时才写入统计字段。
- ICE 遣返、递解、刑满移交类内容自动改投 Supabase 的“驱逐快报”，不进入 ICE 抓捕统计。
- 特朗普讲话、政策、司法及相关新闻写入“特朗普动态”。
- 高可信、事实完整内容：AI编辑后自动发布。
- 不确定、低可信、冲突或高风险内容：AI编辑完整后写入现有后台草稿。
- 已发布内容可在后台打开、再次编辑、隐藏和恢复。
- 新增来源注册表、来源管理、自动化日志、AI可信度和待审核原因。
- 新增文章历史版本表和自动化字段。

## 部署前必须完成

1. 在 Supabase SQL Editor 执行：

   `supabase-news-engine-v3.sql`

2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 新增：

   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - 已有的 `X_BEARER_TOKEN`
   - 已有的 `OPENAI_API_KEY`

   `SUPABASE_SERVICE_ROLE_KEY` 只能放 GitHub Secret，禁止写入前端或公开文件。

3. 把本压缩包内容覆盖上传到 GitHub 仓库根目录。

4. 打开 GitHub Actions，手动运行一次：

   - `ICE执法自动抓取发布`
   - `特朗普实时动态自动发布`

5. 检查后台：

   - 文章管理：自动发布与草稿
   - 来源管理：来源注册表是否已导入
   - 自动化日志：本次抓取、发布、草稿、重复和失败数量

## 分类规则

- `ICE执法`：新发生的抓捕、拘留、突袭、联合行动。
- `驱逐快报`：驱逐、遣返、递解、遣返航班、刑满移交 ICE、最终递解令。
- `特朗普动态`：特朗普本人讲话、白宫信息、政策、行政令、司法、调查、上诉和法院裁决。

## 注意

X API、OpenAI API 或 Supabase Secret 未配置时，对应自动化无法完整运行。静态页面仍可部署，但自动写入后台不会发生。
