import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBoundedJobsSnapshot,
  inspectJobsCache,
  JOBS_CACHE_MAX_AGE_MS,
  JOBS_CACHE_MAX_ITEMS,
  parseJobsCache,
  type CachedJob,
} from './jobs-cache-core.ts';

const job = (id: string): CachedJob => ({
  id,
  title: `Job ${id}`,
  description: 'Public description',
  state_code: 'NY',
  city: 'Flushing',
  contact: { type: 'email', value: 'jobs@example.com' },
});

test('bounds and deduplicates valid job snapshots', () => {
  const items = Array.from({ length: JOBS_CACHE_MAX_ITEMS + 5 }, (_, index) => job(String(index)));
  items.splice(2, 0, job('1'));
  items.splice(3, 0, { ...job('invalid'), title: '' });

  const snapshot = createBoundedJobsSnapshot(items);

  assert.equal(snapshot.length, JOBS_CACHE_MAX_ITEMS);
  assert.equal(new Set(snapshot.map((item) => item.id)).size, JOBS_CACHE_MAX_ITEMS);
  assert.equal(snapshot.some((item) => item.id === 'invalid'), false);
});

test('parses a fresh validated cache envelope', () => {
  const now = 2_000_000;
  const payload = parseJobsCache(JSON.stringify({ savedAt: now - 1_000, items: [job('1')] }), now);

  assert.equal(payload?.savedAt, now - 1_000);
  assert.deepEqual(payload?.items, [job('1')]);
});

test('classifies expired cache separately from malformed content', () => {
  const now = 20_000_000_000;
  const expired = inspectJobsCache(JSON.stringify({ savedAt: now - JOBS_CACHE_MAX_AGE_MS - 1, items: [job('1')] }), now);
  const future = inspectJobsCache(JSON.stringify({ savedAt: now + 10 * 60 * 1000, items: [job('1')] }), now);

  assert.deepEqual(expired, { payload: null, discardReason: 'expired' });
  assert.deepEqual(future, { payload: null, discardReason: 'invalid' });
  assert.deepEqual(inspectJobsCache(null, now), { payload: null, discardReason: null });
});

test('rejects expired, malformed, oversized, and unsafe contact caches', () => {
  const now = 20_000_000_000;
  assert.equal(parseJobsCache(JSON.stringify({ savedAt: now - JOBS_CACHE_MAX_AGE_MS - 1, items: [job('1')] }), now), null);
  assert.equal(parseJobsCache('{not-json', now), null);
  assert.equal(parseJobsCache(JSON.stringify({ savedAt: now, items: Array.from({ length: JOBS_CACHE_MAX_ITEMS + 1 }, (_, index) => job(String(index))) }), now), null);
  assert.equal(parseJobsCache(JSON.stringify({ savedAt: now, items: [{ ...job('1'), contact: { type: 'sms', value: '123' } }] }), now), null);
  assert.equal(parseJobsCache(JSON.stringify({ savedAt: now, items: [{ ...job('1'), salary_min: 'Infinity' }] }), now), null);
});
