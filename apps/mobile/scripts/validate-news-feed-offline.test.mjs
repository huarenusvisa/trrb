import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const home = await readFile(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
const list = await readFile(new URL('../src/components/PaginatedNewsList.tsx', import.meta.url), 'utf8');
const image = await readFile(new URL('../src/components/NewsImage.tsx', import.meta.url), 'utf8');
const foregroundRetry = await readFile(new URL('../src/hooks/useForegroundRetry.ts', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../src/i18n/i18n-core.ts', import.meta.url), 'utf8');

test('restores homepage and list snapshots before refreshing official news', () => {
  assert.match(home, /readCachedHomeFeed/);
  assert.match(home, /cacheHomeFeed\(merged, focus\)/);
  assert.match(list, /readCachedNewsPage\(category, q\)/);
  assert.match(list, /cacheNewsPage\(category, q, page\.articles/);
  assert.match(home, /t\(error === 'offline' \? 'home\.offline' : 'home\.loadFailed'\)/);
  assert.match(i18n, /'home\.offline': '网络不可用，正在显示上次读取的新闻/);
  assert.match(list, /t\('news\.offline'\)/);
});

test('uses the shared image fallback across homepage and category cards', () => {
  assert.doesNotMatch(home, /<Image\s/);
  assert.doesNotMatch(list, /<Image\s/);
  assert.match(home, /<NewsImage/g);
  assert.match(list, /<NewsImage/);
  assert.match(image, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(image, /retryCount >= 1/);
  assert.match(image, /setTimeout[\s\S]*setRetryCount[\s\S]*900/);
  assert.match(image, /cachePolicy="memory-disk"/);
  assert.match(image, /recyclingKey=\{`\$\{uri\}:\$\{retryCount\}`\}/);
  assert.match(image, /contentFit="cover"/);
  assert.match(image, /transition=\{120\}/);
});

test('defers below-the-fold service modules until the first interaction settles', () => {
  assert.match(home, /InteractionManager\.runAfterInteractions/);
  assert.match(home, /showDeferredServices \? \(/);
  assert.match(home, /showDeferredServices[\s\S]*portalSections\.map/);
});

test('paints the canonical feed before loading supplements and prefetches only a small image queue', () => {
  const firstPaint = home.indexOf('setArticles(global)');
  const supplements = home.indexOf('const supplementCategories = homepageSupplementGaps(global)');
  assert.ok(firstPaint >= 0 && supplements > firstPaint);
  assert.match(home, /sequence !== loadSequence\.current/);
  assert.match(home, /prefetchNewsImages\(imagePrefetchQueue, 6\)/);
  assert.match(image, /ExpoImage\.prefetch\(unique, 'memory-disk'\)/);
  assert.match(image, /\.slice\(0, limit\)/);
});

test('explains slow initial and refresh requests without clearing visible news', () => {
  assert.match(home, /setTimeout[\s\S]*setSlowLoading\(true\)[\s\S]*4000/);
  assert.match(home, /t\('home\.slowLoading'\)/);
  assert.match(home, /t\('home\.slowRefresh'\)/);
  assert.match(i18n, /'home\.slowLoading': '当前网络较慢，仍在尝试读取最新新闻/);
  assert.match(i18n, /'home\.slowRefresh': '当前网络较慢，已保留现有新闻/);
  assert.match(home, /clearTimeout\(slowTimer\)/);
});

test('retries failed feeds after foreground recovery and exposes accessible retry controls', () => {
  assert.match(foregroundRetry, /AppState\.addEventListener\('change'/);
  assert.match(foregroundRetry, /state !== 'active'/);
  assert.match(foregroundRetry, /DEFAULT_DELAY_MS = 750/);
  assert.match(foregroundRetry, /DEFAULT_COOLDOWN_MS = 10_000/);
  assert.match(home, /useForegroundRetry\(Boolean\(error\), retryHome\)/);
  assert.match(list, /useForegroundRetry\(Boolean\(error\), retryList\)/);
  assert.match(home, /testID="home-network-retry"[\s\S]*accessibilityRole="button"/);
  assert.match(list, /testID="category-network-retry"[\s\S]*accessibilityRole="button"/);
  assert.match(home, /accessibilityLiveRegion="polite"/);
  assert.match(list, /accessibilityLiveRegion="polite"/);
});

test('bounds long-list rendering work and exposes every story as a button', () => {
  assert.match(list, /initialNumToRender=\{8\}/);
  assert.match(list, /maxToRenderPerBatch=\{8\}/);
  assert.match(list, /windowSize=\{7\}/);
  assert.match(list, /removeClippedSubviews/);
  assert.match(list, /getItemLayout=.*length: 130, offset: 130 \* index/s);
  assert.match(list, /accessibilityRole="button"/);
});
