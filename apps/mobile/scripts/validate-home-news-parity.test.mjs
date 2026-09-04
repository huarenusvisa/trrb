import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('keeps the App homepage on the PC mobile content structure', () => {
  const home = read('app/(tabs)/index.tsx');
  const api = read('src/api/trrb.ts');
  const renderStart = home.indexOf('return (');
  const renderedHome = home.slice(renderStart);
  const markers = ['testID="home-important-carousel"', 'testID="home-rankings"', 'testID="home-topics"', 'testID={`home-news-${key}`}', 'testID={`home-portal-${section.key}`}', 'testID="home-reader-services"'];
  let position = -1;
  for (const marker of markers) {
    const next = renderedHome.indexOf(marker);
    assert.ok(next > position, `${marker} must remain in canonical homepage order`);
    position = next;
  }
  assert.match(home, /title: '牛来｜唐人财经'/);
  assert.match(home, /newsSections = \[\s*\{ key: 'china-hot', title: '中国热门头条'/);
  for (const section of ['移民法官通过率', '移民美国', '美国判例与新规', '招聘求职', '移民社区', '订阅每日快报', '加入读者群', '投稿爆料']) {
    assert.ok(home.includes(section), `${section} must stay on the App homepage`);
  }
  assert.match(api, /public-home-articles/);
});

test('shows the U.S. section once instead of repeating it on every card', () => {
  const america = read('app/(tabs)/america.tsx');
  const i18n = read('src/i18n/i18n-core.ts');
  assert.match(i18n, /'america\.heading': '美国时政'/);
  assert.doesNotMatch(america, /style=\{styles\.cat\}/);
});

test('keeps category labels at the page level and rotates important news on the homepage', () => {
  const home = read('app/(tabs)/index.tsx');
  const list = read('src/components/PaginatedNewsList.tsx');
  assert.match(list, /testID="category-screen-title"/);
  assert.doesNotMatch(list, /newsCategoryName|styles\.category/);
  assert.match(home, /testID="home-important-carousel"/);
  assert.match(home, /pagingEnabled/);
  assert.match(home, /importantCarousel\.map/);
  assert.match(home, /setInterval[\s\S]*carouselRef\.current\?\.scrollTo/);
  assert.match(home, /HOME_NAV_ITEMS = \['重要新闻', '热门头条', '美国时政', '美国警情', '招聘求职'\]/);
});

test('permanently removes the retired officialdom and ICE news blocks from the homepage', () => {
  const home = read('app/(tabs)/index.tsx');
  assert.doesNotMatch(home, /中国官场/);
  assert.doesNotMatch(home, /key: 'ice'/);
  assert.doesNotMatch(home, /title: 'ICE执法动态'/);
  assert.doesNotMatch(home, /rankCategories[^;]*ICE/s);
  assert.doesNotMatch(home, /HOME_NAV_ITEMS[^;]*ICE/s);
});

test('renders continuous previous and next official-news navigation', () => {
  const detail = read('app/article/[id].tsx');
  const api = read('src/api/trrb.ts');
  assert.match(api, /fetchArticleNavigation/);
  assert.match(api, /fetchArticlePage\(\{ offset, limit: 60 \}\)/);
  assert.match(detail, /testID="article-previous"/);
  assert.match(detail, /testID="article-next"/);
});
