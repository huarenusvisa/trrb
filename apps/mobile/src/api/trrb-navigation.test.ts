import assert from 'node:assert/strict';
import test from 'node:test';
import { articleNavigationFromOrderedArticles } from './trrb.ts';
import type { NewsArticle } from './trrb.ts';

const ordered: NewsArticle[] = [
  { id: 'newer', title: '较新新闻' },
  { id: 'current', title: '当前新闻' },
  { id: 'older', title: '较早新闻' },
];

test('uses the canonical newest-first PC feed for previous and next stories', () => {
  const navigation = articleNavigationFromOrderedArticles(ordered, 'current');
  assert.equal(navigation?.previous?.id, 'newer');
  assert.equal(navigation?.next?.id, 'older');
});

test('keeps feed boundaries safe and rejects an unrelated article', () => {
  assert.equal(articleNavigationFromOrderedArticles(ordered, 'newer')?.previous, null);
  assert.equal(articleNavigationFromOrderedArticles(ordered, 'older')?.next, null);
  assert.equal(articleNavigationFromOrderedArticles(ordered, 'missing'), null);
});
