-- WordPress migration lookups are used by each historical article request.
-- Avoid scanning all article rows and detoasting every metadata value per URL.
create index if not exists articles_legacy_id_lookup_idx on public.articles (legacy_id);
create index if not exists articles_legacy_alias_lookup_idx on public.articles
  using gin ((metadata -> 'legacy_alias_ids'));
