import assert from 'node:assert/strict';
import test from 'node:test';
import { optimisticCommunityPostLike, resolveCommunityPostLike } from './community-post-like-state.ts';

test('optimistically toggles community likes without allowing a negative count', () => {
  assert.deepEqual(
    optimisticCommunityPostLike({ like_count: 3, viewer_has_liked: false }),
    { like_count: 4, viewer_has_liked: true },
  );
  assert.deepEqual(
    optimisticCommunityPostLike({ like_count: 0, viewer_has_liked: true }),
    { like_count: 0, viewer_has_liked: false },
  );
});

test('uses the server result as the final community like state', () => {
  assert.deepEqual(
    resolveCommunityPostLike(
      { like_count: 8, viewer_has_liked: true, title: '保留其他字段' },
      { liked: false, like_count: 6 },
    ),
    { like_count: 6, viewer_has_liked: false, title: '保留其他字段' },
  );
});
