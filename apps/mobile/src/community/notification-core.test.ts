import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationLabel, notificationTarget } from './notification-core.ts';

test('routes community notifications to an encoded post and optional comment', () => {
  assert.equal(notificationTarget({ type: 'community_post_like', community_post_id: 'post/1' }), '/community/post%2F1');
  assert.equal(notificationTarget({
    type: 'community_reply', community_post_id: 'post-1', community_comment_id: 'comment/2',
  }), '/community/post-1?commentId=comment%2F2');
});

test('keeps existing notification destinations and safe fallbacks', () => {
  assert.equal(notificationTarget({ type: 'comment_reply', article_id: 'news/42' }), '/article/news%2F42');
  assert.equal(notificationTarget({ type: 'follow', actor_user_id: 'user/1' }), '/user/user%2F1');
  assert.equal(notificationTarget({ type: 'system' }), null);
  assert.equal(notificationTarget({ type: 'message' }), '/messages');
  assert.equal(notificationTarget({ type: 'message', conversation_id: 'chat/1' }), '/chat/chat%2F1');
});

test('labels every community interaction distinctly', () => {
  assert.match(notificationLabel('community_reply'), /回复/);
  assert.match(notificationLabel('community_post_like'), /帖子/);
  assert.match(notificationLabel('community_comment_like'), /评论/);
  assert.match(notificationLabel('community_report'), /举报/);
});
