-- Match chronological collection/deduplication reads without sorting the full post table.
create index if not exists ice_posts_source_order_idx on public.ice_posts
  (source_created_at desc nulls last, created_at desc, id desc);
