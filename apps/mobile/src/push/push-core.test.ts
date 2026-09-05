import assert from 'node:assert/strict';
import test from 'node:test';
import { pushTargetPath, shouldRequestPushPermission } from './push-core.ts';

test('routes article notifications and encodes identifiers', () => {
  assert.equal(pushTargetPath({ article_id: 'news/42' }), '/article/news%2F42');
  assert.equal(pushTargetPath({ articleId: 7 }), '/article/7');
});

test('routes community and inbox notifications', () => {
  assert.equal(pushTargetPath({ community_post_id: 'post-1' }), '/community/post-1');
  assert.equal(pushTargetPath({ community_post_id: 'post-1', community_comment_id: 'comment/2' }), '/community/post-1?commentId=comment%2F2');
  assert.equal(pushTargetPath({ type: 'comment_reply' }), '/notifications');
});

test('rejects arbitrary notification links', () => {
  assert.equal(pushTargetPath({ url: 'https://example.com/phishing' }), null);
  assert.equal(pushTargetPath({ article_id: '   ' }), null);
});

test('only an explicit user action may prompt for permission', () => {
  assert.equal(shouldRequestPushPermission('undetermined', false), false);
  assert.equal(shouldRequestPushPermission('denied', false), false);
  assert.equal(shouldRequestPushPermission('undetermined', true), true);
  assert.equal(shouldRequestPushPermission('granted', true), false);
});
