# 唐人日报 V3.1 高标准新闻引擎

## 部署顺序
1. 在 Supabase SQL Editor 执行 `supabase-news-engine-v3.1.sql`。
2. 将本包全部文件覆盖到 GitHub 仓库根目录。
3. GitHub Secrets 必须包含：`X_BEARER_TOKEN`、`OPENAI_API_KEY`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`。
4. 手动运行 ICE 与 Trump 两个 Actions 各一次。
5. 检查后台“待审核草稿、来源管理、自动化日志”。

## 本版关键修复
- 可信新闻自动编辑并发布；待定新闻自动编辑后进入草稿。
- 来源注册表开始驱动 X 账号抓取，不再仅依赖工作流写死账号。
- 增加分支机构来源种子、来源启停与新增功能。
- ICE、特朗普专题页优先读取 Supabase 已发布内容，后台编辑/隐藏后前台同步。
- 发布后默认保留 slug，补充 SEO、可见性、历史版本和来源发现数据结构。
- 主页布局未修改。
