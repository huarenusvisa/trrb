import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CommunityPost } from '../api/community-core';
import { communityFeedCacheKey, parseCommunityFeedCache, publicCommunityFeedSnapshot } from './community-feed-cache-core';

export async function readCachedCommunityFeed(category = '') {
  const key = communityFeedCacheKey(category);
  const raw = await AsyncStorage.getItem(key);
  const payload = parseCommunityFeedCache(raw);
  if (!payload && raw) await AsyncStorage.removeItem(key);
  return payload?.snapshot ?? null;
}

export async function cacheCommunityFeed(posts: CommunityPost[], nextOffset: number | null, category = '') {
  const snapshot = publicCommunityFeedSnapshot(posts, nextOffset);
  await AsyncStorage.setItem(communityFeedCacheKey(category), JSON.stringify({ savedAt: Date.now(), snapshot }));
}
