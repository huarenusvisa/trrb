import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoundedNewsFeedSnapshot, NEWS_FEED_CACHE_MAX_AGE_MS, NEWS_FEED_CACHE_MAX_ARTICLES, newsFeedKeysToPrune, parseNewsFeedCache } from './news-feed-cache-core.ts';

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
  assert.equal(parseNewsFeedCache(JSON.stringify({ savedAt: 100, snapshot: { articles: [], nextOffset: -1 } })), null);
});

test('bounds and deduplicates cached pagination without leaving an unsafe cursor gap', () => {
  const articles = Array.from({ length: NEWS_FEED_CACHE_MAX_ARTICLES + 8 }, (_, index) => ({ id: `news-${index}`, title: `News ${index}` }));
  articles.splice(10, 0, articles[3]);
  const snapshot = createBoundedNewsFeedSnapshot(articles, 96);
  assert.equal(snapshot.articles.length, NEWS_FEED_CACHE_MAX_ARTICLES);
  assert.equal(new Set(snapshot.articles.map((item) => item.id)).size, NEWS_FEED_CACHE_MAX_ARTICLES);
  assert.equal(snapshot.nextOffset, null);
});

test('keeps the server cursor when every cached article fits', () => {
  const snapshot = createBoundedNewsFeedSnapshot([article, article, { id: 'news-2', title: 'Second' }], 48);
  assert.deepEqual(snapshot.articles.map((item) => item.id), ['news-1', 'news-2']);
  assert.equal(snapshot.nextOffset, 48);
});

test('prunes the oldest list snapshots', () => {
  const remove = newsFeedKeysToPrune([
    { key: 'new', savedAt: 30 },
    { key: 'old', savedAt: 10 },
    { key: 'middle', savedAt: 20 },
  ], 2);
  assert.deepEqual(remove, ['old']);
});
