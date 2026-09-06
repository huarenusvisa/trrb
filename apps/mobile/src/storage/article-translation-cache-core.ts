import type { ArticleTranslation } from '../api/trrb';

export const ARTICLE_TRANSLATION_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const ARTICLE_TRANSLATION_CACHE_MAX_ITEMS = 80;
export const ARTICLE_TRANSLATION_CACHE_MAX_BYTES = 2 * 1024 * 1024;

export type ArticleTranslationCacheEnvelope = {
  savedAt: number;
  translation: ArticleTranslation;
};

export function parseArticleTranslationCache(
  raw: string | null,
  expectedArticleId: string | number,
  expectedLocale: ArticleTranslation['locale'],
  options: { now?: number } = {},
): ArticleTranslationCacheEnvelope | null {
  if (!raw || raw.length > ARTICLE_TRANSLATION_CACHE_MAX_BYTES) return null;
  try {
    const payload = JSON.parse(raw) as ArticleTranslationCacheEnvelope;
    const savedAt = Number(payload?.savedAt);
    const translation = payload?.translation;
    const now = options.now ?? Date.now();
    if (!Number.isFinite(savedAt) || savedAt <= 0 || savedAt > now) return null;
    if (now - savedAt > ARTICLE_TRANSLATION_CACHE_MAX_AGE_MS) return null;
    if (!translation || String(translation.article_id) !== String(expectedArticleId)) return null;
    if (translation.locale !== expectedLocale || (translation.locale !== 'en' && translation.locale !== 'zh-TW')) return null;
    if (!String(translation.title || '').trim() || !String(translation.content || '').trim()) return null;
    if (!String(translation.reviewed_at || '').trim() || !String(translation.source_article_updated_at || '').trim()) return null;
    return { savedAt, translation };
  } catch {
    return null;
  }
}

export function translationCacheKeysToPrune(
  entries: Array<{ key: string; savedAt: number | null }>,
  maxItems = ARTICLE_TRANSLATION_CACHE_MAX_ITEMS,
) {
  return [...entries]
    .sort((a, b) => (Number.isFinite(b.savedAt) ? Number(b.savedAt) : -1) - (Number.isFinite(a.savedAt) ? Number(a.savedAt) : -1))
    .slice(Math.max(0, maxItems))
    .map((entry) => entry.key);
}
