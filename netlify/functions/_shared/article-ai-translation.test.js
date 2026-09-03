const test = require('node:test');
const assert = require('node:assert/strict');
const { splitTranslationContent, TRANSLATION_CHUNK_SIZE, MAX_TRANSLATION_CHUNKS } = require('./article-ai');

test('keeps ordinary articles in a single request', () => {
  assert.deepEqual(splitTranslationContent('第一段。\n\n第二段。'), ['第一段。\n\n第二段。']);
});

test('splits long articles on sentence boundaries without dropping text', () => {
  const sentence = '这是包含事实、数字2026和姓名的新闻句子。';
  const source = Array.from({ length: 900 }, () => sentence).join('\n');
  const chunks = splitTranslationContent(source);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= TRANSLATION_CHUNK_SIZE));
  assert.equal(chunks.join('\n').replace(/\s/g, ''), source.replace(/\s/g, ''));
});

test('rejects oversized input instead of silently truncating news', () => {
  assert.throws(() => splitTranslationContent('甲'.repeat(TRANSLATION_CHUNK_SIZE * MAX_TRANSLATION_CHUNKS + 1)), /安全分段上限/);
});
