import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewsArticle } from '../api/trrb';
import {
  createBoundedNewsFeedSnapshot,
  NEWS_FEED_CACHE_MAX_ITEMS,
  type NewsFeedCacheEnvelope,
  newsFeedKeysToPrune,
  parseNewsFeedCache,
} from './news-feed-cache-core';

const HOME_KEY = 'trrb.news.feed.v1.home';
const LIST_PREFIX = 'trrb.news.feed.v1.list.';

function listKey(category?: string, q?: string) {
  return LIST_PREFIX + encodeURIComponent(JSON.stringify({ category: category || '', q: q || '' }));
}

async function readEnvelope(key: string): Promise<NewsFeedCacheEnvelope | null> {
  const raw = await AsyncStorage.getItem(key);
  const payload = parseNewsFeedCache(raw, { allowStale: true });
  if (!payload && raw) await AsyncStorage.removeItem(key);
  return payload;
}

async function read(key: string) {
  return (await readEnvelope(key))?.snapshot ?? null;
}

export async function readCachedHomeFeed() {
  return read(HOME_KEY);
}

export async function cacheHomeFeed(articles: NewsArticle[], focusArticles: NewsArticle[]) {
  await AsyncStorage.setItem(HOME_KEY, JSON.stringify({ savedAt: Date.now(), snapshot: { articles, focusArticles } }));
}

export async function readCachedNewsPage(category?: string, q?: string) {
  return read(listKey(category, q));
}

export async function readCachedNewsPageEnvelope(category?: string, q?: string) {
  return readEnvelope(listKey(category, q));
}

export async function cacheNewsPage(category: string | undefined, q: string | undefined, articles: NewsArticle[], nextOffset: number | null) {
  const key = listKey(category, q);
  const snapshot = createBoundedNewsFeedSnapshot(articles, nextOffset);
  await AsyncStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), snapshot }));
  const keys = (await AsyncStorage.getAllKeys()).filter((item) => item.startsWith(LIST_PREFIX));
  if (keys.length <= NEWS_FEED_CACHE_MAX_ITEMS) return;
  const rows = await AsyncStorage.multiGet(keys);
  const entries = rows.map(([itemKey, raw]) => ({
    key: itemKey,
    savedAt: parseNewsFeedCache(raw, { allowStale: true })?.savedAt ?? null,
  }));
  const remove = newsFeedKeysToPrune(entries);
  if (remove.length) await AsyncStorage.multiRemove(remove);
}
