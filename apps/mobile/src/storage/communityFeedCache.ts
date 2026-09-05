import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CommunityPost } from '../api/community-core';
import { parseCommunityFeedCache, publicCommunityFeedSnapshot } from './community-feed-cache-core';

const KEY = 'trrb.community.feed.v1';

export async function readCachedCommunityFeed() {
  const raw = await AsyncStorage.getItem(KEY);
  const payload = parseCommunityFeedCache(raw);
  if (!payload && raw) await AsyncStorage.removeItem(KEY);
  return payload?.snapshot ?? null;
}

export async function cacheCommunityFeed(posts: CommunityPost[], nextOffset: number | null) {
  const snapshot = publicCommunityFeedSnapshot(posts, nextOffset);
  await AsyncStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), snapshot }));
}
