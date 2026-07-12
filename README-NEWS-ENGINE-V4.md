# 唐人日报 V4 新闻中台部署说明

## 核心修复
- Supabase URL 即使误填为 `/rest/v1` 地址，也会自动规范化为项目根地址。
- ICE 与特朗普工作流都先执行数据库健康检查和来源注册表同步。
- 每条有新闻价值的内容都会写入 `news_candidates`。
- 可信内容写入 `articles` 为 `published`；待审核内容写入 `articles` 为 `draft`。
- 每轮运行写入 `automation_logs`，数据库写入失败会令 Action 明确失败，不再“静态发布成功但后台没有数据”。
- X API 5xx/429 会自动重试并保留旧数据。

## 部署顺序
1. 在 Supabase SQL Editor 执行 `supabase-news-engine-v4.sql`。
2. 确认 GitHub Secrets：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`X_BEARER_TOKEN`、`OPENAI_API_KEY`、`OPENAI_MODEL`。
3. 上传整个项目到 GitHub。
4. 分别手动运行 ICE 和特朗普工作流。
5. 用 SQL 验收：

```sql
select pipeline, run_at, fetched, processed, published, drafted, failed
from public.automation_logs order by run_at desc limit 10;
```

```sql
select created_at, title, primary_section, status, source_name, source_url, ai_confidence
from public.articles
where automation_source in ('ice-radar-v4','trump-radar-v4')
order by created_at desc limit 20;
```
