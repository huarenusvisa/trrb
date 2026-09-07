import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMUNITY_FEED_CACHE_MAX_AGE_MS,
  COMMUNITY_FEED_CACHE_MAX_POSTS,
  communityFeedCacheKey,
  inspectCommunityFeedCache,
  parseCommunityFeedCache,
  publicCommunityFeedSnapshot,
} from './community-feed-cache-core.ts';

const post = {
  id: 'post-1', user_id: 'user-1', category: 'immigration_help', title: '公开帖子', content: '公开内容',
  content_label: 'question', status: 'published', like_count: 1, viewer_has_liked: false,
  comment_count: 2, created_at: '2026-09-05T00:00:00Z',
} as const;

test('restores a recent public community page', () => {
  const raw = JSON.stringify({ savedAt: 100, snapshot: { posts: [post], nextOffset: 20 } });
  assert.equal(parseCommunityFeedCache(raw, 200)?.snapshot.posts[0].id, 'post-1');
  assert.equal(parseCommunityFeedCache(raw, COMMUNITY_FEED_CACHE_MAX_AGE_MS + 101), null);
});

test('classifies expired cache separately from malformed or future content', () => {
  const now = 20_000_000_000;
  const expired = JSON.stringify({ savedAt: now - COMMUNITY_FEED_CACHE_MAX_AGE_MS - 1, snapshot: { posts: [post], nextOffset: 20 } });
  const future = JSON.stringify({ savedAt: now + 10 * 60 * 1000, snapshot: { posts: [post], nextOffset: 20 } });

  assert.deepEqual(inspectCommunityFeedCache(expired, now), { payload: null, discardReason: 'expired' });
  assert.deepEqual(inspectCommunityFeedCache(future, now), { payload: null, discardReason: 'invalid' });
  assert.deepEqual(inspectCommunityFeedCache(null, now), { payload: null, discardReason: null });
});

test('never persists pending, oversized, or malformed community posts', () => {
  const pending = { ...post, id: 'pending-1', status: 'pending' as const };
  assert.deepEqual(publicCommunityFeedSnapshot([pending, post], 20).posts.map((item) => item.id), ['post-1']);
  assert.equal(publicCommunityFeedSnapshot([post], -1).nextOffset, null);
  assert.equal(parseCommunityFeedCache(JSON.stringify({ savedAt: 100, snapshot: { posts: [pending], nextOffset: null } }), 200), null);
  assert.equal(parseCommunityFeedCache(JSON.stringify({ savedAt: 100, snapshot: { posts: Array.from({ length: COMMUNITY_FEED_CACHE_MAX_POSTS + 1 }, (_, index) => ({ ...post, id: String(index) })), nextOffset: 20 } }), 200), null);
  assert.equal(parseCommunityFeedCache(JSON.stringify({ savedAt: 100, snapshot: { posts: [post], nextOffset: -1 } }), 200), null);
  assert.equal(parseCommunityFeedCache('{', 200), null);
});

test('deduplicates bounded pagination snapshots and closes a cursor when content is truncated', () => {
  const posts = Array.from({ length: COMMUNITY_FEED_CACHE_MAX_POSTS + 5 }, (_, index) => ({ ...post, id: `post-${index}` }));
  const truncated = publicCommunityFeedSnapshot([posts[0], ...posts], 80);

  assert.equal(truncated.posts.length, COMMUNITY_FEED_CACHE_MAX_POSTS);
  assert.equal(new Set(truncated.posts.map((item) => item.id)).size, COMMUNITY_FEED_CACHE_MAX_POSTS);
  assert.equal(truncated.nextOffset, null);
  assert.equal(publicCommunityFeedSnapshot(posts.slice(0, 40), 40).nextOffset, 40);
});

test('isolates each community category cache from the all-posts cache', () => {
  assert.equal(communityFeedCacheKey(), 'trrb.community.feed.v1');
  assert.equal(communityFeedCacheKey('ice_experience'), 'trrb.community.feed.v1.category.ice_experience');
  assert.notEqual(communityFeedCacheKey('tipoff'), communityFeedCacheKey('immigration_help'));
});
