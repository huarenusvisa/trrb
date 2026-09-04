import assert from 'node:assert/strict';
import test from 'node:test';
import { NEWS_FEED_CACHE_MAX_AGE_MS, newsFeedKeysToPrune, parseNewsFeedCache } from './news-feed-cache-core.ts';

const article = { id: 'news-1', title: '测试新闻' };

test('parses a valid cached feed and accepts stale data for offline recovery', () => {
  const raw = JSON.stringify({ savedAt: 100, snapshot: { articles: [article], focusArticles: [article], nextOffset: 24 } });
  assert.equal(parseNewsFeedCache(raw, { now: 200 })?.snapshot.articles[0].id, 'news-1');
  assert.equal(parseNewsFeedCache(raw, { now: NEWS_FEED_CACHE_MAX_AGE_MS + 101 }), null);
  assert.ok(parseNewsFeedCache(raw, { now: NEWS_FEED_CACHE_MAX_AGE_MS + 101, allowStale: true }));
});

test('rejects malformed cache records', () => {
  assert.equal(parseNewsFeedCache('{'), null);
  assert.equal(parseNewsFeedCache(JSON.stringify({ savedAt: 100, snapshot: { articles: [{ id: '', title: '' }] } })), null);
  assert.equal(parseNewsFeedCache(JSON.stringify({ savedAt: 100, snapshot: { articles: [], nextOffset: '24' } })), null);
});

test('prunes the oldest list snapshots', () => {
  const remove = newsFeedKeysToPrune([
    { key: 'new', savedAt: 30 },
    { key: 'old', savedAt: 10 },
    { key: 'middle', savedAt: 20 },
  ], 2);
  assert.deepEqual(remove, ['old']);
});
