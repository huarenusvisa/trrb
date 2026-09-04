import assert from 'node:assert/strict';
import test from 'node:test';
import { articleNavigationFromOrderedArticles, homepageSupplementGaps } from './trrb.ts';
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

test('requests only homepage categories that are missing from the canonical feed', () => {
  const covered: NewsArticle[] = [
    ...Array.from({ length: 8 }, (_, index) => ({ id: `hot-${index}`, title: '热门', category_name: '中国热门头条' })),
    ...Array.from({ length: 6 }, (_, index) => ({ id: `politics-${index}`, title: '时政', category_name: '美国时政' })),
    ...Array.from({ length: 6 }, (_, index) => ({ id: `crime-${index}`, title: '警情', category_name: '美国警情' })),
    ...Array.from({ length: 6 }, (_, index) => ({ id: `ice-${index}`, title: '执法', topic_key: 'ice' })),
  ];
  assert.deepEqual(homepageSupplementGaps(covered), []);

  const gaps = homepageSupplementGaps(covered.filter((item) => item.category_name !== '美国警情').slice(0, -2));
  assert.ok(gaps.includes('美国警情'));
  assert.ok(gaps.includes('ICE执法动态'));
  assert.ok(!gaps.includes('重要新闻'));
});
