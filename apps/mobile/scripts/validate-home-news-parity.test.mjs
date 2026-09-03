import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('keeps the App homepage on the PC mobile content structure', () => {
  const home = read('app/(tabs)/index.tsx');
  const api = read('src/api/trrb.ts');
  const markers = ['24小时热榜', '专题聚焦', '服务与数据库'];
  let position = -1;
  for (const marker of markers) {
    const next = home.indexOf(marker);
    assert.ok(next > position, `${marker} must remain in canonical homepage order`);
    position = next;
  }
  assert.match(home, /title: '牛来｜唐人财经'/);
  assert.match(api, /public-home-articles/);
});

test('shows the U.S. section once instead of repeating it on every card', () => {
  const america = read('app/(tabs)/america.tsx');
  const i18n = read('src/i18n/i18n-core.ts');
  assert.match(i18n, /'america\.heading': '美国时政'/);
  assert.doesNotMatch(america, /style=\{styles\.cat\}/);
});

test('renders continuous previous and next official-news navigation', () => {
  const detail = read('app/article/[id].tsx');
  const api = read('src/api/trrb.ts');
  assert.match(api, /fetchArticleNavigation/);
  assert.match(api, /fetchArticlePage\(\{ offset, limit: 60 \}\)/);
  assert.match(detail, /testID="article-previous"/);
  assert.match(detail, /testID="article-next"/);
});
