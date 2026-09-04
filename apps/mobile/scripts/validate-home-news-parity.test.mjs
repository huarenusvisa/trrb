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
  assert.match(home, /HOME_NAV_ITEMS = \['重要新闻', '热门头条', '美国时政', '美国警情', '招聘求职', 'ICE执法动态'\]/);
});

test('keeps ICE in its designated sections, ranking, nav and qualified focus carousel', () => {
  const home = read('app/(tabs)/index.tsx');
  const api = read('src/api/trrb.ts');
  const focus = fs.readFileSync(new URL('../../../netlify/functions/public-home-focus.js', import.meta.url), 'utf8');
  const publicArticles = fs.readFileSync(new URL('../../../netlify/functions/public-articles.js', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /中国官场/);
  assert.match(home, /key: 'ice',[\s\S]*?title: 'ICE执法动态'/);
  assert.match(home, /key: 'ice-news', title: 'ICE执法动态'/);
  assert.equal((home.match(/title: 'ICE执法动态'/g) || []).length, 2);
  assert.match(home, /rankCategories[^;]*'ICE执法动态'/s);
  assert.match(home, /const rankItems = useMemo[\s\S]*?return articles[\s\S]*?rankCategories\.has/);
  assert.match(home, /HOME_NAV_ITEMS[^;]*'ICE执法动态'/s);
  assert.match(api, /export async function fetchHomepageFocus/);
  assert.match(home, /fetchHomepageFocus\(\)\.catch/);
  assert.match(home, /const importantCarousel = useMemo[\s\S]*?return focusArticles\.filter/);
  assert.match(focus, /MIN_LONGFORM_CHARS = 1500/);
  assert.match(focus, /isIceEnforcementText/);
  assert.match(focus, /textLength\(row\?\.content\) < MIN_LONGFORM_CHARS/);
  assert.match(focus, /b\.homepage_focus_score - a\.homepage_focus_score/);
  assert.match(publicArticles, /category === "ICE执法动态"/);
  assert.match(publicArticles, /topic_key\.eq\.ice/);
  assert.match(publicArticles, /isIceEnforcementText/);
  assert.match(home, /const homepageArticles = useMemo\(\(\) => articles\.filter\(\(item\) => !isHiddenHomepageCategory/);
  assert.match(home, /value\.startsWith\('中国官'\)[^;]*\/ICE\/i\.test\(value\)/);
  assert.match(home, /section\.key === 'ice-news' \? articles : homepageArticles/);
});

test('renders continuous previous and next official-news navigation', () => {
  const detail = read('app/article/[id].tsx');
  const api = read('src/api/trrb.ts');
  assert.match(api, /fetchArticleNavigation/);
  assert.match(api, /fetchArticlePage\(\{ offset, limit: 60 \}\)/);
  assert.match(detail, /testID="article-previous"/);
  assert.match(detail, /testID="article-next"/);
});
