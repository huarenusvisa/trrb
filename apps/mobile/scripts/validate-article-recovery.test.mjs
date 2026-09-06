import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const article = await readFile(new URL('../app/article/[id].tsx', import.meta.url), 'utf8');
const i18n = await readFile(new URL('../src/i18n/i18n-core.ts', import.meta.url), 'utf8');

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
  assert.match(article, /accessibilityState=\{\{ selected: favorite, disabled: Boolean\(actionBusy\), busy: actionBusy === 'favorite' \}\}/);
  assert.match(article, /accessibilityRole="link"/);
  assert.match(article, /minHeight:48/g);
});

test('reviewed translation failures remain retryable without hiding the published source', () => {
  assert.match(article, /withTimeout\(fetchArticleTranslation/);
  assert.match(article, /setTranslationError\(true\)/);
  assert.match(article, /useForegroundRetry\(translationError, retryTranslation\)/);
  assert.match(article, /testID="article-translation-error"[\s\S]*accessibilityRole="alert"/);
  assert.match(article, /testID="article-translation-retry"[\s\S]*onPress=\{retryTranslation\}/);
  assert.equal((i18n.match(/'article\.translationFailed':/g) || []).length, 3);
  assert.equal((i18n.match(/'article\.retryTranslation':/g) || []).length, 3);
});

test('reviewed translations restore from isolated local cache and survive refresh failures', () => {
  assert.match(article, /readCachedArticleTranslation\(article\.id, locale\)/);
  assert.match(article, /if \(cached\)[\s\S]*setTranslation\(cached\)[\s\S]*if \(offline\) \{/);
  assert.match(article, /cacheArticleTranslation\(row\)/);
  assert.match(article, /if \(!row\) await removeCachedArticleTranslation/);
  assert.match(article, /catch \{[\s\S]*if \(!cached\)[\s\S]*setTranslationError\(true\)/);
});

test('article actions serialize native work and report localized failures accessibly', () => {
  assert.match(article, /if \(actionBusy\) return/);
  assert.match(article, /Linking\.canOpenURL\(webUrl\)/);
  assert.match(article, /testID="article-action-notice"/);
  assert.match(article, /accessibilityLiveRegion="polite"/);
  assert.match(article, /disabled=\{Boolean\(actionBusy\)\}/g);
  for (const key of ['saveFailed', 'shareFailed', 'copyFailed', 'openWebsiteFailed']) {
    assert.equal((i18n.match(new RegExp(`'article\\.${key}':`, 'g')) || []).length, 3);
  }
});
