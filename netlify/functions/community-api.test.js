const assert = require('node:assert/strict');
const test = require('node:test');
const { moderation, clean, commentCountAfterUnpublish } = require('./community-api')._test;

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
