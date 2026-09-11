import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARTICLE_TRANSLATION_CACHE_MAX_AGE_MS,
  ARTICLE_TRANSLATION_CACHE_MAX_BYTES,
  parseArticleTranslationCache,
  translationCacheKeysToPrune,
} from './article-translation-cache-core.ts';

const translation = {
  article_id: 'article-1', locale: 'en' as const, title: 'Reviewed title', summary: 'Reviewed summary',
  content: 'Reviewed content', translation_source: 'reviewed_server_cache', reviewed_at: '2026-09-01T00:00:00Z',
  source_article_updated_at: '2026-08-31T00:00:00Z',
};

test('translation cache restores a recent reviewed translation', () => {
  const now = 2_000_000;
  const result = parseArticleTranslationCache(JSON.stringify({ savedAt: now - 1000, translation }), 'article-1', 'en', { now });
  assert.equal(result?.translation.content, 'Reviewed content');
});

test('translation cache isolates article and locale keys', () => {
  const raw = JSON.stringify({ savedAt: 1000, translation });
  assert.equal(parseArticleTranslationCache(raw, 'article-2', 'en', { now: 2000 }), null);
  assert.equal(parseArticleTranslationCache(raw, 'article-1', 'zh-TW', { now: 2000 }), null);
});

test('translation cache rejects expired, future, malformed, and oversized values', () => {
  const now = ARTICLE_TRANSLATION_CACHE_MAX_AGE_MS + 10_000;
  assert.equal(parseArticleTranslationCache(JSON.stringify({ savedAt: 1, translation }), 'article-1', 'en', { now }), null);
  assert.equal(parseArticleTranslationCache(JSON.stringify({ savedAt: now + 1, translation }), 'article-1', 'en', { now }), null);
  assert.equal(parseArticleTranslationCache(JSON.stringify({ savedAt: now, translation: { ...translation, reviewed_at: '' } }), 'article-1', 'en', { now }), null);
  assert.equal(parseArticleTranslationCache('x'.repeat(ARTICLE_TRANSLATION_CACHE_MAX_BYTES + 1), 'article-1', 'en', { now }), null);
});

test('translation cache pruning keeps the newest bounded set', () => {
  assert.deepEqual(translationCacheKeysToPrune([
    { key: 'old', savedAt: 1 }, { key: 'new', savedAt: 3 }, { key: 'middle', savedAt: 2 }, { key: 'invalid', savedAt: null },
  ], 2), ['old', 'invalid']);
});
