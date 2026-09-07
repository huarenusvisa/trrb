import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBoundedJobsSnapshot, parseJobsCache, type CachedJob } from './jobs-cache-core';

const JOBS_CACHE_KEY = 'trrb.jobs.feed.v1';

export async function readCachedJobs() {
  const raw = await AsyncStorage.getItem(JOBS_CACHE_KEY);
  const payload = parseJobsCache(raw);
  if (!payload && raw) await AsyncStorage.removeItem(JOBS_CACHE_KEY);
  return payload;
}

export async function cacheJobs(items: CachedJob[]) {
  const bounded = createBoundedJobsSnapshot(items);
  await AsyncStorage.setItem(JOBS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: bounded }));
}
