const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_BATCH, planBatch } = require('./translation-batch-plan');
const articles = Array.from({ length: 4 }, (_, index) => ({ id: String(index + 1), generation_eligible: true, estimated_requests: index + 1, content_characters: 1000 }));

test('plans at most three missing translations with a conservative request estimate', () => {
  const plan = planBatch(articles, [], ['1', '2', '3'], 'en');
  assert.equal(MAX_BATCH, 3); assert.equal(plan.error, ''); assert.equal(plan.items.length, 3); assert.equal(plan.estimatedRequests, 6); assert.equal(plan.totalCharacters, 3000);
});
test('rejects oversized batches and existing translations before model calls', () => {
  assert.match(planBatch(articles, [], ['1', '2', '3', '4'], 'en').error, /最多/);
  assert.match(planBatch(articles, [{ article_id: '2', locale: 'en' }], ['2'], 'en').error, /已有/);
});
test('rejects unsafe article lengths', () => {
  assert.match(planBatch([{ id: 'x', generation_eligible: false }], [], ['x'], 'zh-TW').error, /安全长度/);
});
