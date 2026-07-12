# 唐人日报 V4 部署顺序

1. 在 Supabase SQL Editor 执行 `supabase-news-engine-v4.sql`。
2. 确认 GitHub Repository Secrets：`OPENAI_API_KEY`、`OPENAI_MODEL`、`X_BEARER_TOKEN`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`。
3. 上传全部文件到仓库根目录。
4. Actions 中先运行 ICE，再运行特朗普工作流。
5. 两个工作流都会先运行健康检查；数据库表或密钥错误会明确失败，不会再出现“静态发布成功但后台没有数据”的假成功。
6. 在 Supabase 验证：
```sql
select run_at,pipeline,fetched,processed,published,drafted,failed from public.automation_logs order by run_at desc limit 10;
select created_at,title,primary_section,status,source_name,ai_confidence from public.articles order by created_at desc limit 20;
```

V4 自动修正了常见的 `SUPABASE_URL` 粘贴错误：即使误粘贴了 `/rest/v1` 路径，也会规范化为项目根地址。
