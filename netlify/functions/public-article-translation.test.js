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

test('public endpoint only returns published translations for the current article revision', () => {
  const source = fs.readFileSync(path.join(__dirname, 'public-article-translation.js'), 'utf8');
  for (const fragment of ['status: \'eq.published\'', 'visibility: \'eq.public\'', 'source_article_updated_at:', 'reviewed_at']) {
    assert.ok(source.includes(fragment), `endpoint must contain ${fragment}`);
  }
  assert.doesNotMatch(source, /OPENAI_API_KEY|ANTHROPIC_API_KEY/i);
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
