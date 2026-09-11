import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGAL_CACHE_MAX_AGE_MS, parseLegalAnalysisCache, parseLegalCache } from './legal-cache-core.ts';

test('legal cache restores a valid recent snapshot', () => {
  const now = 2_000_000;
  const value = parseLegalCache(JSON.stringify({ savedAt: now - 1000, records: [{ id: 'case-1', title: 'Matter of Test' }] }), { now });
  assert.equal(value?.records[0]?.id, 'case-1');
});

test('legal analysis cache restores valid detail content', () => {
  const now = 2_000_000;
  const value = parseLegalAnalysisCache(JSON.stringify({ savedAt: now - 1000, analyses: [{ recordId: 'case-1', summary: 'Cached summary' }] }), { now });
  assert.equal(value?.analyses[0]?.summary, 'Cached summary');
});

test('legal analysis cache rejects malformed and expired snapshots', () => {
  const now = LEGAL_CACHE_MAX_AGE_MS + 10_000;
  const raw = JSON.stringify({ savedAt: 1, analyses: [{ recordId: 'case-1' }] });
  assert.equal(parseLegalAnalysisCache(raw, { now }), null);
  assert.equal(parseLegalAnalysisCache(raw, { now, allowStale: true })?.analyses.length, 1);
  assert.equal(parseLegalAnalysisCache(JSON.stringify({ savedAt: now, analyses: [{ summary: 'Missing id' }] }), { now }), null);
});

test('legal cache rejects malformed and expired snapshots unless stale recovery is requested', () => {
  const now = LEGAL_CACHE_MAX_AGE_MS + 10_000;
  const raw = JSON.stringify({ savedAt: 1, records: [{ id: 'case-1' }] });
  assert.equal(parseLegalCache(raw, { now }), null);
  assert.equal(parseLegalCache(raw, { now, allowStale: true })?.records.length, 1);
  assert.equal(parseLegalCache(JSON.stringify({ savedAt: now, records: [{ title: 'Missing id' }] }), { now }), null);
});
