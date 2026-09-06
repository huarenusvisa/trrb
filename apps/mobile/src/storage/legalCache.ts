import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseLegalCache, type CachedLegalRecord } from './legal-cache-core';

const LEGAL_CACHE_KEY = 'trrb.legal.records.v1';

export async function readCachedLegalRecords() {
  const raw = await AsyncStorage.getItem(LEGAL_CACHE_KEY);
  const payload = parseLegalCache(raw, { allowStale: true });
  if (!payload && raw) await AsyncStorage.removeItem(LEGAL_CACHE_KEY);
  return payload?.records ?? null;
}

export async function cacheLegalRecords(records: CachedLegalRecord[]) {
  await AsyncStorage.setItem(LEGAL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), records }));
}
