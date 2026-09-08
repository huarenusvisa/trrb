import assert from 'node:assert/strict';
import test from 'node:test';
import { indexReviewedTranslations, reviewedNewsTitle } from './reviewed-translations-core.ts';

const reviewed = {
  article_id: 'article-1',
  locale: 'en' as const,
  title: 'Reviewed English headline',
  summary: 'Reviewed summary',
  content: 'Reviewed content',
  translation_source: 'reviewed_server_cache',
  reviewed_at: '2026-09-08T00:00:00Z',
  source_article_updated_at: '2026-09-07T00:00:00Z',
};

test('indexes only complete reviewed rows for the selected news locale', () => {
  assert.deepEqual(indexReviewedTranslations([reviewed], 'en'), { 'article-1': reviewed });
  assert.deepEqual(indexReviewedTranslations([{ ...reviewed, title: '' }], 'en'), {});
  assert.deepEqual(indexReviewedTranslations([{ ...reviewed, reviewed_at: '' }], 'en'), {});
  assert.deepEqual(indexReviewedTranslations([reviewed], 'zh-TW'), {});
  assert.deepEqual(indexReviewedTranslations([reviewed], 'zh-CN'), {});
});

test('uses a reviewed headline when available and otherwise preserves the published source', () => {
  const article = { id: 'article-1', title: '原始标题' };
  assert.equal(reviewedNewsTitle(article, { 'article-1': reviewed }), 'Reviewed English headline');
  assert.equal(reviewedNewsTitle(article, {}), '原始标题');
});
