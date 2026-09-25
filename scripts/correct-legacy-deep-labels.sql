-- Metadata-only correction of the three audited topic_only bypasses.
-- Published text, status, source, ID and fixed URL stay intact; the existing
-- article version trigger and this audit object retain the original label.
with affected as (
  select id, length(regexp_replace(content, '[^㐀-鿿]', '', 'g')) as chars
  from public.articles
  where id in ('8c0c1133-4197-4f1a-9158-78290f416fe8','670a9260-ee60-45c0-b877-1be57f858f4d','03f4b31d-40aa-43b7-928c-0dcba0387b8c')
    and status='published' and automation_source='china-hot-li-teacher-v2'
    and metadata->>'editorial_depth'='deep'
    and coalesce(metadata->>'manual_override','false') <> 'true'
    and nullif(metadata->>'reviewed_by','') is null
    and nullif(metadata->>'human_category_override','') is null
    and length(regexp_replace(content, '[^㐀-鿿]', '', 'g')) < 1500
)
update public.articles a
set metadata = a.metadata || jsonb_build_object(
  'editorial_depth',case when affected.chars < 800 then 'brief' else 'standard' end,
  'article_format',case when affected.chars < 800 then 'hot_brief' else 'report' end,
  'depth_label_correction',jsonb_build_object('previous_depth',a.metadata->>'editorial_depth','previous_format',a.metadata->>'article_format','body_characters',affected.chars,'reason','topic_only曾绕过深度最低字数；纠正标签，不改写原文','corrected_at',now())
)
from affected where a.id=affected.id
returning a.id,a.metadata->>'editorial_depth' as editorial_depth,a.metadata->>'article_format' as article_format;
