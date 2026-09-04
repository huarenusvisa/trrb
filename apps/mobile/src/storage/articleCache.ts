import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewsArticle } from '../api/trrb';
import { ARTICLE_CACHE_MAX_ITEMS, cacheKeysToPrune, parseArticleCache } from './article-cache-core';

const PREFIX = 'trrb.article.cache.v1.';

export async function cacheArticle(article: NewsArticle) {
  const payload = { savedAt: Date.now(), article };
  await AsyncStorage.setItem(PREFIX + String(article.id), JSON.stringify(payload));
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
  if (keys.length <= ARTICLE_CACHE_MAX_ITEMS) return;
  const rows = await AsyncStorage.multiGet(keys);
  const entries = rows.map(([key, raw]) => ({
    key,
    savedAt: parseArticleCache(raw, key.slice(PREFIX.length), { allowStale: true })?.savedAt ?? null,
  }));
  const keysToRemove = cacheKeysToPrune(entries);
  if (keysToRemove.length) await AsyncStorage.multiRemove(keysToRemove);
}

export async function readCachedArticle(id: string | number, allowStale = true): Promise<NewsArticle | null> {
  const raw = await AsyncStorage.getItem(PREFIX + String(id));
  const payload = parseArticleCache(raw, id, { allowStale });
  if (!payload && raw) await AsyncStorage.removeItem(PREFIX + String(id));
  return payload?.article ?? null;
}

export async function removeCachedArticle(id: string | number) {
  await AsyncStorage.removeItem(PREFIX + String(id));
}
