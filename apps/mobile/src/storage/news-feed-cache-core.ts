import type { NewsArticle } from '../api/trrb';

export const NEWS_FEED_CACHE_MAX_ITEMS = 12;
export const NEWS_FEED_CACHE_MAX_ARTICLES = 72;
export const NEWS_FEED_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type NewsFeedSnapshot = {
  articles: NewsArticle[];
  focusArticles?: NewsArticle[];
  nextOffset?: number | null;
};

export type NewsFeedCacheEnvelope = {
  savedAt: number;
  snapshot: NewsFeedSnapshot;
};

function validArticle(article: NewsArticle) {
  return Boolean(article && String(article.id || '').trim() && String(article.title || '').trim());
}

export function createBoundedNewsFeedSnapshot(
  articles: NewsArticle[],
  nextOffset: number | null,
  maxArticles = NEWS_FEED_CACHE_MAX_ARTICLES,
): NewsFeedSnapshot {
  const limit = Number.isInteger(maxArticles) && maxArticles > 0 ? maxArticles : NEWS_FEED_CACHE_MAX_ARTICLES;
  const seen = new Set<string>();
  const unique = articles.filter((article) => {
    const key = String(article?.id || '').trim();
    if (!validArticle(article) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const truncated = unique.length > limit;
  const safeNextOffset = nextOffset !== null && Number.isInteger(nextOffset) && nextOffset >= 0 ? nextOffset : null;
  return {
    articles: unique.slice(0, limit),
    // A truncated snapshot must not skip uncached stories when connectivity
    // returns. It ends locally; a normal refresh rebuilds the online cursor.
    nextOffset: truncated ? null : safeNextOffset,
  };
}

export function parseNewsFeedCache(
  raw: string | null,
  options: { allowStale?: boolean; now?: number } = {},
): NewsFeedCacheEnvelope | null {
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as NewsFeedCacheEnvelope;
    const savedAt = Number(payload?.savedAt);
    const snapshot = payload?.snapshot;
    if (!Number.isFinite(savedAt) || savedAt <= 0 || !Array.isArray(snapshot?.articles)) return null;
    if (!snapshot.articles.every(validArticle)) return null;
    if (snapshot.focusArticles && (!Array.isArray(snapshot.focusArticles) || !snapshot.focusArticles.every(validArticle))) return null;
    if (snapshot.nextOffset !== undefined && snapshot.nextOffset !== null && (!Number.isInteger(snapshot.nextOffset) || snapshot.nextOffset < 0)) return null;
    const now = options.now ?? Date.now();
    if (!options.allowStale && now - savedAt > NEWS_FEED_CACHE_MAX_AGE_MS) return null;
    return { savedAt, snapshot };
  } catch {
    return null;
  }
}

export function newsFeedKeysToPrune(
  entries: Array<{ key: string; savedAt: number | null }>,
  maxItems = NEWS_FEED_CACHE_MAX_ITEMS,
) {
  return [...entries]
    .sort((a, b) => (b.savedAt ?? -1) - (a.savedAt ?? -1))
    .slice(Math.max(0, maxItems))
    .map((entry) => entry.key);
}
