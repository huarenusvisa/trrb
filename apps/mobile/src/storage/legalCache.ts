import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseLegalAnalysisCache, parseLegalCache, type CachedLegalAnalysis, type CachedLegalRecord } from './legal-cache-core';

const LEGAL_CACHE_KEY = 'trrb.legal.records.v1';
const LEGAL_ANALYSIS_CACHE_KEY = 'trrb.legal.analyses.v1';

export async function readCachedLegalRecords() {
  const raw = await AsyncStorage.getItem(LEGAL_CACHE_KEY);
  const payload = parseLegalCache(raw, { allowStale: true });
  if (!payload && raw) await AsyncStorage.removeItem(LEGAL_CACHE_KEY);
  return payload?.records ?? null;
}

export async function cacheLegalRecords(records: CachedLegalRecord[]) {
  await AsyncStorage.setItem(LEGAL_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), records }));
}

export async function readCachedLegalAnalyses() {
  const raw = await AsyncStorage.getItem(LEGAL_ANALYSIS_CACHE_KEY);
  const payload = parseLegalAnalysisCache(raw, { allowStale: true });
  if (!payload && raw) await AsyncStorage.removeItem(LEGAL_ANALYSIS_CACHE_KEY);
  return payload?.analyses ?? null;
}

export async function cacheLegalAnalyses(analyses: CachedLegalAnalysis[]) {
  await AsyncStorage.setItem(LEGAL_ANALYSIS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), analyses }));
}
