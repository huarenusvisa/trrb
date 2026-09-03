const test = require('node:test');
const assert = require('node:assert/strict');
const { audit } = require('./translation-review-audit');

test('flags numbers missing from a translation', () => {
  const result = audit('2026年，金额为56万美元。', 'In 2026, the amount was withheld.');
  assert.deepEqual(result.missingNumbers, ['56']);
  assert.match(result.warnings[0], /56/);
});

test('flags likely paragraph truncation without blocking editorial judgment', () => {
  const result = audit('一。\n\n二。\n\n三。\n\n四。', 'One paragraph only.');
  assert.equal(result.sourceParagraphs, 4);
  assert.equal(result.translatedParagraphs, 1);
  assert.ok(result.warnings.some((item) => item.includes('截断')));
});
