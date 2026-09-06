import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('keeps search and category discovery recoverable with narrow screens and large text', () => {
  const search = read('app/search.tsx');
  const list = read('src/components/PaginatedNewsList.tsx');

  assert.match(search, /withUiTimeout\(fetchTrendingSearches\(\), t\('news\.loadFailed'\)\)/);
  assert.match(search, /useForegroundRetry\(trendingError/);
  assert.match(search, /testID="search-trending-retry"/);
  assert.match(search, /useWindowDimensions\(\)/);
  assert.match(search, /width < 360/);
  assert.match(search, /minHeight:44/);
  assert.match(search, /flexWrap:'wrap'/);
  assert.match(list, /fontScale >= 1\.3/);
  assert.match(list, /numberOfLines=\{largeText \? undefined : 3\}/);
  assert.match(list, /removeClippedSubviews=\{!largeText\}/);
  assert.doesNotMatch(list, /getItemLayout=/);
  assert.doesNotMatch(list, /card:\{height:118/);
});
