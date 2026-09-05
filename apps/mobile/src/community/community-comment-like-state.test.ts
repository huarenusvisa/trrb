import assert from 'node:assert/strict';
import test from 'node:test';
import { optimisticCommunityCommentLike, resolveCommunityCommentLike } from './community-comment-like-state.ts';

test('optimistically sets a community comment like target once', () => {
  const comment = { id: 'comment-1', like_count: 2, viewer_has_liked: false };
  const liked = optimisticCommunityCommentLike(comment, true);
  assert.deepEqual(liked, { id: 'comment-1', like_count: 3, viewer_has_liked: true });
  assert.equal(optimisticCommunityCommentLike(liked, true), liked);
  assert.deepEqual(optimisticCommunityCommentLike(liked, false), {
    id: 'comment-1', like_count: 2, viewer_has_liked: false,
  });
});

test('uses the server result as the final community comment like state', () => {
  assert.deepEqual(
    resolveCommunityCommentLike(
      { id: 'comment-1', like_count: 4, viewer_has_liked: true },
      { liked: false, like_count: 2 },
    ),
    { id: 'comment-1', like_count: 2, viewer_has_liked: false },
  );
});
