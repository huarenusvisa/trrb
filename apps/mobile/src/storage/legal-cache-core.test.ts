import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGAL_CACHE_MAX_AGE_MS, parseLegalCache } from './legal-cache-core.ts';

test('legal cache restores a valid recent snapshot', () => {
  const now = 2_000_000;
  const value = parseLegalCache(JSON.stringify({ savedAt: now - 1000, records: [{ id: 'case-1', title: 'Matter of Test' }] }), { now });
  assert.equal(value?.records[0]?.id, 'case-1');
});

test('legal cache rejects malformed and expired snapshots unless stale recovery is requested', () => {
  const now = LEGAL_CACHE_MAX_AGE_MS + 10_000;
  const raw = JSON.stringify({ savedAt: 1, records: [{ id: 'case-1' }] });
  assert.equal(parseLegalCache(raw, { now }), null);
  assert.equal(parseLegalCache(raw, { now, allowStale: true })?.records.length, 1);
  assert.equal(parseLegalCache(JSON.stringify({ savedAt: now, records: [{ title: 'Missing id' }] }), { now }), null);
});
