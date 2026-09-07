import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBoundedJobsSnapshot, inspectJobsCache, type CachedJob } from './jobs-cache-core';

const JOBS_CACHE_KEY = 'trrb.jobs.feed.v1';

export async function readCachedJobs() {
  const raw = await AsyncStorage.getItem(JOBS_CACHE_KEY);
  const result = inspectJobsCache(raw);
  if (result.discardReason && raw) await AsyncStorage.removeItem(JOBS_CACHE_KEY);
  return result;
}

export async function cacheJobs(items: CachedJob[]) {
  const bounded = createBoundedJobsSnapshot(items);
  await AsyncStorage.setItem(JOBS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: bounded }));
}
