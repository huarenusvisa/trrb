import assert from 'node:assert/strict';
import test from 'node:test';
import { hydrateCommentLikeState, updateCommentLikeState } from './comment-like-state.ts';

test('hydrates aggregate counts and the current viewer state without exposing liker rows', () => {
  const rows = hydrateCommentLikeState([
    { id: 'one', content: 'first', comment_likes: [{ count: 3 }] },
    { id: 'two', content: 'second', comment_likes: [] },
    { id: 'bad', content: 'third', comment_likes: [{ count: -4 }] },
  ], ['two']);

  assert.deepEqual(rows, [
    { id: 'one', content: 'first', like_count: 3, viewer_has_liked: false },
    { id: 'two', content: 'second', like_count: 0, viewer_has_liked: true },
    { id: 'bad', content: 'third', like_count: 0, viewer_has_liked: false },
  ]);
  assert.equal('comment_likes' in rows[0], false);
});

test('updates like counts once and never allows a negative count', () => {
  const initial = [{ id: 'one', like_count: 2, viewer_has_liked: false }];
  const liked = updateCommentLikeState(initial, 'one', true);
  const duplicate = updateCommentLikeState(liked, 'one', true);
  const unliked = updateCommentLikeState([{ id: 'one', like_count: 0, viewer_has_liked: true }], 'one', false);

  assert.deepEqual(liked, [{ id: 'one', like_count: 3, viewer_has_liked: true }]);
  assert.deepEqual(duplicate, liked);
  assert.deepEqual(unliked, [{ id: 'one', like_count: 0, viewer_has_liked: false }]);
});
