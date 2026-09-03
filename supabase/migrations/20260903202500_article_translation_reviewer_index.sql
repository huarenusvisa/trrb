-- Cover the reviewer foreign key for account deletion and review audits.
create index if not exists article_translations_reviewed_by_idx
  on public.article_translations (reviewed_by)
  where reviewed_by is not null;
