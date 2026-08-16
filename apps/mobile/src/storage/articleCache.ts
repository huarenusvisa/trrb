import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewsArticle } from '../api/trrb';

const PREFIX = 'trrb.article.cache.v1.';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type CachedArticle = { savedAt: number; article: NewsArticle };

export async function cacheArticle(article: NewsArticle) {
  const payload: CachedArticle = { savedAt: Date.now(), article };
  await AsyncStorage.setItem(PREFIX + String(article.id), JSON.stringify(payload));
}

export async function readCachedArticle(id: string | number, allowStale = true): Promise<NewsArticle | null> {
  const raw = await AsyncStorage.getItem(PREFIX + String(id));
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as CachedArticle;
    if (!payload?.article) return null;
    if (!allowStale && Date.now() - Number(payload.savedAt || 0) > MAX_AGE_MS) return null;
    return payload.article;
  } catch {
    return null;
  }
}

export async function removeCachedArticle(id: string | number) {
  await AsyncStorage.removeItem(PREFIX + String(id));
}
