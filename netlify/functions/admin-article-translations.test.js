const test = require('node:test');
const assert = require('node:assert/strict');

const source = require('node:fs').readFileSync(require.resolve('./admin-article-translations'), 'utf8');
const { validLocale, reviewedFields, ROLES } = require('./admin-article-translations')._test;

test('only reviewed translation locales are accepted', () => {
  assert.equal(validLocale('en'), 'en');
  assert.equal(validLocale('zh-TW'), 'zh-TW');
  assert.equal(validLocale('zh-CN'), '');
});

test('reviewed fields require a title and content', () => {
  assert.throws(() => reviewedFields({ title: '', content: '' }), /不能为空/);
  assert.deepEqual(reviewedFields({ title: 'Title', summary: '', content: 'Body' }), { title: 'Title', summary: null, content: 'Body' });
});

test('generation is staff-only and always saved as draft', () => {
  assert.deepEqual(ROLES, ['owner', 'editor', 'admin']);
  assert.match(source, /authenticateStaff\(event, ROLES\)/);
  assert.match(source, /status: 'draft'/);
  assert.match(source, /openai_review_required/);
  assert.match(source, /body\.cost_confirmed !== true/);
  assert.doesNotMatch(source, /action === 'generate'[\s\S]{0,900}status: 'published'/);
});

test('publication records the authenticated human reviewer', () => {
  assert.match(source, /action === 'publish'/);
  assert.match(source, /reviewed_by: actor\.user\.id/);
  assert.match(source, /reviewed_at: new Date\(\)\.toISOString\(\)/);
  assert.match(source, /body\.review_confirmed !== true/);
});

test('published translations cannot be overwritten by a generated draft', () => {
  assert.match(source, /existing\?\.status === 'published'/);
  assert.match(source, /不能被 AI 草稿覆盖/);
});
