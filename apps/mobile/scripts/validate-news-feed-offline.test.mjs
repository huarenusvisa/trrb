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
  assert.match(image, /recordSharedFailure\(uri\)/);
  assert.match(image, /sharedRetryDelay\(uri\)/);
  assert.match(image, /setTimeout[\s\S]*setRetryCount/);
  assert.match(image, /cachePolicy="memory-disk"/);
  assert.match(image, /recyclingKey=\{uri\}/);
  assert.match(image, /contentFit="cover"/);
  assert.match(image, /transition=\{120\}/);
});

test('downscales list images early and backs off repeated broken URLs', () => {
  assert.match(list, /<NewsImage[^>]*priority="low"/);
  assert.match(image, /priority=\{priority\}/);
  assert.match(image, /memo\(function NewsImage/);
  assert.match(image, /allowDownscaling/);
  assert.match(image, /enforceEarlyResizing/);
  assert.match(image, /onLoad=\{\(\) => sharedFailures\.delete\(uri\)\}/);
  assert.match(image, /filter\(\(uri\).*sharedRetryDelay\(uri\) === 0/);
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
  assert.match(list, /removeClippedSubviews=\{!largeText\}/);
  assert.match(list, /fontScale >= 1\.3/);
  assert.match(list, /card:\{minHeight:118/);
  assert.doesNotMatch(list, /getItemLayout=/);
  assert.match(list, /accessibilityRole="button"/);
});

test('prefetches only the next image window as list rows become visible', () => {
  assert.match(list, /onViewableItemsChanged=\{onViewableItemsChanged\}/);
  assert.match(list, /itemVisiblePercentThreshold: 50/);
  assert.match(list, /minimumViewTime: 120/);
  assert.match(list, /nextNewsImagePrefetchWindow/);
  assert.match(list, /prefetchedThroughRef\.current = next\.prefetchedThrough/);
  assert.match(list, /prefetchNewsImages\(next\.uris, 4\)/);
});

test('deduplicates pagination and ignores responses from stale feeds', () => {
  assert.match(list, /new NewsPageRequestGate\(\)/);
  assert.match(list, /gate\.startRefresh\(\) : gate\.startAppend\(offset\)/);
  assert.match(list, /if \(!gate\.isCurrent\(token\)\) return/);
  assert.match(list, /requestGateRef\.current\.resetFeed\(\)/);
  assert.match(list, /requestGateRef\.current\.isCurrent\(generation\)/);
  assert.match(list, /if \(gate\.finish\(token\)\)/);
});

test('keeps visible stories and retries failed pagination in place', () => {
  assert.match(list, /setLoadMoreError\(t\('news\.loadMoreFailed'\)\)/);
  assert.match(list, /useForegroundRetry\(Boolean\(loadMoreError\), retryLoadMore\)/);
  assert.match(list, /testID="category-load-more-error"[\s\S]*accessibilityRole="alert"/);
  assert.match(list, /testID="category-load-more-retry"[\s\S]*accessibilityRole="button"/);
  assert.match(list, /onPress=\{retryLoadMore\}/);
  assert.match(i18n, /'news\.loadMoreFailed': '更多新闻加载失败，已保留当前内容。'/);
  assert.match(i18n, /'news\.retryLoadMore': 'Retry loading more'/);
});
