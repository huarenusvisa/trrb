import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ArticleTranslation } from '../api/trrb';
import {
  ARTICLE_TRANSLATION_CACHE_MAX_ITEMS,
  parseArticleTranslationCache,
  translationCacheKeysToPrune,
} from './article-translation-cache-core';

const PREFIX = 'trrb.article.translation.cache.v1.';

function cacheKey(articleId: string | number, locale: ArticleTranslation['locale']) {
  return `${PREFIX}${locale}.${String(articleId)}`;
}

export async function cacheArticleTranslation(translation: ArticleTranslation) {
  const key = cacheKey(translation.article_id, translation.locale);
  await AsyncStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), translation }));
  const keys = (await AsyncStorage.getAllKeys()).filter((candidate) => candidate.startsWith(PREFIX));
  if (keys.length <= ARTICLE_TRANSLATION_CACHE_MAX_ITEMS) return;
  const rows = await AsyncStorage.multiGet(keys);
  const entries = rows.map(([candidate, raw]) => {
    const suffix = candidate.slice(PREFIX.length);
    const separator = suffix.indexOf('.');
    const locale = suffix.slice(0, separator) as ArticleTranslation['locale'];
    const articleId = suffix.slice(separator + 1);
    return { key: candidate, savedAt: parseArticleTranslationCache(raw, articleId, locale)?.savedAt ?? null };
  });
  const keysToRemove = translationCacheKeysToPrune(entries);
  if (keysToRemove.length) await AsyncStorage.multiRemove(keysToRemove);
}

export async function readCachedArticleTranslation(
  articleId: string | number,
  locale: ArticleTranslation['locale'],
): Promise<ArticleTranslation | null> {
  const key = cacheKey(articleId, locale);
  const raw = await AsyncStorage.getItem(key);
  const payload = parseArticleTranslationCache(raw, articleId, locale);
  if (!payload && raw) await AsyncStorage.removeItem(key);
  return payload?.translation ?? null;
}

export async function removeCachedArticleTranslation(
  articleId: string | number,
  locale: ArticleTranslation['locale'],
) {
  await AsyncStorage.removeItem(cacheKey(articleId, locale));
}
