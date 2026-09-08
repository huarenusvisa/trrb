const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { _test } = require('./public-article-translation');

test('normalizes only supported public translation locales', () => {
  assert.equal(_test.normalizeLocale('en-US'), 'en');
  assert.equal(_test.normalizeLocale('zh-Hant'), 'zh-TW');
  assert.equal(_test.normalizeLocale('zh-HK'), 'zh-TW');
  assert.equal(_test.normalizeLocale('zh-CN'), '');
  assert.equal(_test.normalizeLocale('fr'), '');
});

test('accepts only a bounded unique UUID list for reviewed translation batches', () => {
  const first = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const second = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  assert.deepEqual(_test.normalizeIds(`${first}, ${second},${first}`), [first, second]);
  assert.equal(_test.normalizeIds('not-an-id'), null);
  assert.equal(_test.normalizeIds(Array.from({ length: _test.MAX_BATCH_IDS + 1 }, (_, index) => `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`).join(',')), null);
});

test('public endpoint only returns published translations for the current article revision', () => {
  const source = fs.readFileSync(path.join(__dirname, 'public-article-translation.js'), 'utf8');
  for (const fragment of ['status: \'eq.published\'', 'visibility: \'eq.public\'', 'source_article_updated_at:', 'reviewed_at']) {
    assert.ok(source.includes(fragment), `endpoint must contain ${fragment}`);
  }
  assert.doesNotMatch(source, /OPENAI_API_KEY|ANTHROPIC_API_KEY/i);
});

test('batch endpoint remains bounded and returns only current human-reviewed rows', () => {
  const source = fs.readFileSync(path.join(__dirname, 'public-article-translation.js'), 'utf8');
  assert.match(source, /MAX_BATCH_IDS = 40/);
  assert.match(source, /select: 'article_id,locale,title,translation_source,reviewed_at,source_article_updated_at'/);
  assert.match(source, /reviewed_by: 'not\.is\.null'/);
  assert.match(source, /reviewed_at: 'not\.is\.null'/);
  assert.match(source, /revisions\.get\(String\(row\.article_id\)\) === String\(row\.source_article_updated_at\)/);
});

test('migration exposes read-only reviewed translations through RLS', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260903202000_article_translation_cache.sql'), 'utf8');
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all.+anon, authenticated/is);
  assert.match(migration, /grant select.+anon, authenticated/is);
  assert.doesNotMatch(migration, /^grant (?:insert|update|delete|all)[^;]*\b(?:anon|authenticated)\b/im);
  assert.match(migration, /status = 'published'/);
  assert.match(migration, /articles\.updated_at = article_translations\.source_article_updated_at/);
  assert.match(migration, /reviewed_by is not null/);
  const reviewerIndex = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260903202500_article_translation_reviewer_index.sql'), 'utf8');
  assert.match(reviewerIndex, /article_translations \(reviewed_by\)/);
});
