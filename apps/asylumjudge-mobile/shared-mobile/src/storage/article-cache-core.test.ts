import assert from 'node:assert/strict';
import test from 'node:test';
import { ARTICLE_CACHE_MAX_AGE_MS, cacheKeysToPrune, parseArticleCache } from './article-cache-core.ts';

const now = Date.UTC(2026, 8, 4);

test('reads a valid matching article and enforces the freshness window', () => {
  const raw = JSON.stringify({ savedAt: now - 1_000, article: { id: '42', title: 'Cached story', content: 'Body' } });
  assert.equal(parseArticleCache(raw, 42, { allowStale: false, now })?.article.title, 'Cached story');

  const expired = JSON.stringify({ savedAt: now - ARTICLE_CACHE_MAX_AGE_MS - 1, article: { id: '42', title: 'Old story' } });
  assert.equal(parseArticleCache(expired, 42, { allowStale: false, now }), null);
  assert.equal(parseArticleCache(expired, 42, { allowStale: true, now })?.article.title, 'Old story');
});

test('rejects corrupt, mismatched, and untitled cache entries', () => {
  assert.equal(parseArticleCache('{broken', '42'), null);
  assert.equal(parseArticleCache(JSON.stringify({ savedAt: now, article: { id: 'other', title: 'Story' } }), '42'), null);
  assert.equal(parseArticleCache(JSON.stringify({ savedAt: now, article: { id: '42', title: '   ' } }), '42'), null);
});

test('prunes corrupt and least-recently-saved entries after the item limit', () => {
  assert.deepEqual(cacheKeysToPrune([
    { key: 'newest', savedAt: 30 },
    { key: 'corrupt', savedAt: null },
    { key: 'oldest', savedAt: 10 },
    { key: 'middle', savedAt: 20 },
  ], 2), ['oldest', 'corrupt']);
});
