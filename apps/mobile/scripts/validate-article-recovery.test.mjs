import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const article = await readFile(new URL('../app/article/[id].tsx', import.meta.url), 'utf8');

test('article detail bounds primary and supplemental requests without discarding cached content', () => {
  assert.match(article, /REQUEST_TIMEOUT_MS = 12_000/);
  assert.match(article, /withTimeout\(fetchArticle\(id\)\)/);
  assert.match(article, /Promise\.allSettled/);
  assert.match(article, /withTimeout\(fetchRelatedArticles/);
  assert.match(article, /withTimeout\(fetchArticleNavigation/);
  assert.match(article, /if \(!articleRef\.current\)[\s\S]*setRelated\(\[\]\)/);
});

test('article detail supports pull-to-refresh and foreground recovery', () => {
  assert.match(article, /RefreshControl/);
  assert.match(article, /onRefresh=\{\(\) => void load\(false, true\)\}/);
  assert.match(article, /useForegroundRetry\(Boolean\(error\), retryArticle\)/);
  assert.match(article, /accessibilityLiveRegion="polite"/);
  assert.match(article, /accessibilityRole="progressbar"/);
});

test('article cover uses the shared cached image fallback with responsive sizing', () => {
  assert.doesNotMatch(article, /<Image\s/);
  assert.match(article, /<NewsImage testID="article-cover-image"/);
  assert.match(article, /aspectRatio:16\/9/);
  assert.doesNotMatch(article, /image:\{[^}]*height:/);
});

test('article navigation and actions adapt to large text and expose accessible targets', () => {
  assert.match(article, /width < 380 \|\| systemFontScale >= 1\.3/);
  assert.match(article, /navigationRowStacked:\{flexDirection:'column'\}/);
  assert.match(article, /numberOfLines=\{stackedLayout \? undefined : 3\}/g);
  assert.match(article, /accessibilityState=\{\{ selected: favorite \}\}/);
  assert.match(article, /accessibilityRole="link"/);
  assert.match(article, /minHeight:48/g);
});
