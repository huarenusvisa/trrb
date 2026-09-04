import type { NewsArticle } from '../api/trrb';

export const ARTICLE_CACHE_MAX_ITEMS = 40;
export const ARTICLE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type ArticleCacheEnvelope = {
  savedAt: number;
  article: NewsArticle;
};

export function parseArticleCache(
  raw: string | null,
  expectedId: string | number,
  options: { allowStale?: boolean; now?: number } = {},
): ArticleCacheEnvelope | null {
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as ArticleCacheEnvelope;
    const savedAt = Number(payload?.savedAt);
    const article = payload?.article;
    if (!article || String(article.id) !== String(expectedId)) return null;
    if (!String(article.title || '').trim()) return null;
    if (!Number.isFinite(savedAt) || savedAt <= 0) return null;
    const now = options.now ?? Date.now();
    if (!options.allowStale && now - savedAt > ARTICLE_CACHE_MAX_AGE_MS) return null;
    return { savedAt, article };
  } catch {
    return null;
  }
}

export function cacheKeysToPrune(
  entries: Array<{ key: string; savedAt: number | null }>,
  maxItems = ARTICLE_CACHE_MAX_ITEMS,
) {
  const ordered = [...entries].sort((a, b) => {
    const aTime = Number.isFinite(a.savedAt) ? Number(a.savedAt) : -1;
    const bTime = Number.isFinite(b.savedAt) ? Number(b.savedAt) : -1;
    return bTime - aTime;
  });
  return ordered.slice(Math.max(0, maxItems)).map((entry) => entry.key);
}
