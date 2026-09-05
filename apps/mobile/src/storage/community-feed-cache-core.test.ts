import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMUNITY_FEED_CACHE_MAX_AGE_MS, communityFeedCacheKey, parseCommunityFeedCache, publicCommunityFeedSnapshot } from './community-feed-cache-core.ts';

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

test('never persists pending or malformed community posts', () => {
  const pending = { ...post, id: 'pending-1', status: 'pending' as const };
  assert.deepEqual(publicCommunityFeedSnapshot([pending, post], 20).posts.map((item) => item.id), ['post-1']);
  assert.equal(parseCommunityFeedCache(JSON.stringify({ savedAt: 100, snapshot: { posts: [pending], nextOffset: null } }), 200), null);
  assert.equal(parseCommunityFeedCache('{', 200), null);
});

test('isolates each community category cache from the all-posts cache', () => {
  assert.equal(communityFeedCacheKey(), 'trrb.community.feed.v1');
  assert.equal(communityFeedCacheKey('ice_experience'), 'trrb.community.feed.v1.category.ice_experience');
  assert.notEqual(communityFeedCacheKey('tipoff'), communityFeedCacheKey('immigration_help'));
});
