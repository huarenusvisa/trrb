import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const screen = await readFile(new URL('../app/(tabs)/america.tsx', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../src/i18n/i18n-core.ts', import.meta.url), 'utf8');

test('restores U.S. news cache and distinguishes partial from total feed failure', () => {
  assert.match(screen, /Promise\.all\(feeds\.map\(\(category\) => readCachedNewsPage\(category\)/);
  assert.match(screen, /Promise\.allSettled\(feeds\.map\(\(category\) => fetchArticlePage/);
  assert.match(screen, /failed\.includes\(item\.category_name/);
  assert.match(screen, /cacheNewsPage\(category, undefined, page\.articles/);
  assert.match(screen, /t\('america\.partial'\)/);
  assert.match(screen, /itemsRef\.current\.length \? t\('america\.offline'\) : t\('america\.loadFailed'\)/);
  assert.doesNotMatch(screen, /fetchArticles[\s\S]*\.catch\(\(\) => \[\]\)/);
  for (const key of ['america.partial', 'america.offline', 'america.openCategoryA11y']) {
    assert.equal(i18n.split(`'${key}'`).length - 1, 3, `${key} must exist in all three locales`);
  }
});

test('keeps U.S. news recovery controls accessible on narrow screens and with large text', () => {
  assert.match(screen, /useForegroundRetry\(Boolean\(error\), retry\)/);
  assert.match(screen, /testID="america-network-retry"[\s\S]*accessibilityRole="button"/);
  assert.match(screen, /accessibilityRole="alert"/);
  assert.match(screen, /accessibilityLiveRegion="polite"/);
  assert.match(screen, /useWindowDimensions\(\)/);
  assert.match(screen, /width < 360/);
  assert.match(screen, /fontScale >= 1\.3/);
  assert.match(screen, /chips: \{ flexDirection: 'row', flexWrap: 'wrap'/);
  assert.match(screen, /chip: \{ minHeight: 44/);
  assert.match(screen, /retryButton: \{ minHeight: 44/);
  assert.match(screen, /removeClippedSubviews=\{!largeText\}/);
});
