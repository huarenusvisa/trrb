import assert from 'node:assert/strict';
import test from 'node:test';
import { PushResponseGate, pushDestination, pushTargetPath, shouldRequestPushPermission } from './push-core.ts';

test('routes article notifications and encodes identifiers', () => {
  assert.equal(pushTargetPath({ article_id: 'news/42' }), '/article/news%2F42');
  assert.equal(pushTargetPath({ articleId: 7 }), '/article/7');
});

test('routes community and inbox notifications', () => {
  assert.equal(pushTargetPath({ community_post_id: 'post-1' }), '/community/post-1');
  assert.equal(pushTargetPath({ community_post_id: 'post-1', community_comment_id: 'comment/2' }), '/community/post-1?commentId=comment%2F2');
  assert.equal(pushTargetPath({ type: 'comment_reply' }), '/notifications');
  assert.equal(pushTargetPath({ type: 'message' }), '/messages');
  assert.equal(pushTargetPath({ type: 'message', conversation_id: 'chat/7' }), '/chat/chat%2F7');
});

test('rejects arbitrary notification links', () => {
  assert.equal(pushTargetPath({ url: 'https://example.com/phishing' }), null);
  assert.equal(pushTargetPath({ article_id: '   ' }), null);
  assert.equal(pushDestination({ url: 'https://example.com/phishing' }), '/notifications?pushTarget=unavailable');
  assert.equal(pushDestination(undefined), '/notifications?pushTarget=unavailable');
});

test('deduplicates cold-start and listener delivery without permanently consuming a notification', () => {
  const gate = new PushResponseGate();

  assert.equal(gate.claim('notification-1', 1_000), true);
  assert.equal(gate.claim('notification-1', 1_001), false);
  assert.equal(gate.claim('notification-2', 1_001), true);
  assert.equal(gate.claim('notification-1', 16_000), true);
});

test('rejects invalid response identifiers and recovers from future timestamps', () => {
  const gate = new PushResponseGate();

  assert.equal(gate.claim('   ', 1_000), false);
  assert.equal(gate.claim('notification-1', 20_000), true);
  assert.equal(gate.claim('notification-1', 10_000), true);
});

test('only an explicit user action may prompt for permission', () => {
  assert.equal(shouldRequestPushPermission('undetermined', false), false);
  assert.equal(shouldRequestPushPermission('denied', false), false);
  assert.equal(shouldRequestPushPermission('undetermined', true), true);
  assert.equal(shouldRequestPushPermission('granted', true), false);
});
