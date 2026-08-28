-- ICE栏目级开关只控制流水线是否运行；最终发布仍由故事级来源复核决定。
-- 官方来源允许自动发布，非官方来源必须保留给人工审核。
update public.categories
set auto_fetch = true,
    ai_rewrite = true,
    auto_publish = true,
    updated_at = now()
where lower(slug) = 'ice';
