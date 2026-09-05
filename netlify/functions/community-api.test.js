const assert = require('node:assert/strict');
const test = require('node:test');
const { moderation, clean, commentCountAfterUnpublish, withViewerLikeState, withViewerCommentLikeState, resolveLikeMutation, feedPagination } = require('./community-api')._test;

test('ordinary USCIS experience passes basic rules', () => {
  const result = moderation('uscis_interview', '纽约庇护面谈经历', '我在纽约办公室完成面谈，分享当天材料准备和流程。');
  assert.equal(result.status, 'published');
  assert.equal(result.is_indexable, false);
});

test('lawyer reviews always require manual review', () => {
  const result = moderation('lawyer_review', '律师服务经历', '这是我亲身经历的服务过程，希望给其他申请人参考。');
  assert.equal(result.status, 'pending');
  assert.ok(result.risk_flags.includes('category_manual_review'));
});

test('private phone patterns require review', () => {
  const result = moderation('immigration_help', '需要帮助确认材料', '可以联系 212-555-1234，我想请大家看看这些材料是否完整。');
  assert.equal(result.status, 'pending');
});

test('blocked illegal content is rejected', () => {
  assert.throws(() => moderation('hot_discussion', '危险交易', '有人公开买卖枪支并要求社区联系，我准备提供具体交易方式。'), /不能提交/);
});

test('clean strips markup delimiters', () => {
  assert.equal(clean(' <script>alert(1)</script> ', 100), 'scriptalert(1)/script');
});

test('owner unpublish only decrements the public count for a published comment', () => {
  assert.equal(commentCountAfterUnpublish({ status: 'published' }, 3), 2);
  assert.equal(commentCountAfterUnpublish({ status: 'pending' }, 3), 3);
  assert.equal(commentCountAfterUnpublish({ status: 'deleted' }, 0), 0);
});

test('hydrates viewer like state in one response without changing aggregate counts', () => {
  const posts = withViewerLikeState([
    { id: 'post-1', like_count: 4 },
    { id: 'post-2', like_count: 2 },
  ], [{ post_id: 'post-2' }]);

  assert.deepEqual(posts.map((post) => post.viewer_has_liked), [false, true]);
  assert.deepEqual(posts.map((post) => post.like_count), [4, 2]);
  assert.equal(withViewerLikeState([{ id: 'post-1' }])[0].viewer_has_liked, false);
});

test('hydrates community comment likes without exposing liker rows', () => {
  const comments = withViewerCommentLikeState([
    { id: 'comment-1', like_count: 3 },
    { id: 'comment-2', like_count: 1 },
  ], [{ comment_id: 'comment-2' }]);

  assert.deepEqual(comments.map((comment) => comment.viewer_has_liked), [false, true]);
  assert.deepEqual(comments.map((comment) => comment.like_count), [3, 1]);
  assert.equal('user_id' in comments[1], false);
});

test('replaying an explicit community like intent is idempotent', () => {
  assert.deepEqual(resolveLikeMutation(false, 4, true), { liked: true, changed: true, like_count: 5 });
  assert.deepEqual(resolveLikeMutation(true, 5, true), { liked: true, changed: false, like_count: 5 });
  assert.deepEqual(resolveLikeMutation(true, 0, false), { liked: false, changed: true, like_count: 0 });
});

test('bounds community feed pagination input', () => {
  assert.deepEqual(feedPagination({ offset: '20', limit: '20' }), { offset: 20, limit: 20 });
  assert.deepEqual(feedPagination({ offset: '-5', limit: '1000' }), { offset: 0, limit: 30 });
  assert.deepEqual(feedPagination({ offset: 'bad', limit: 'bad' }), { offset: 0, limit: 20 });
});
