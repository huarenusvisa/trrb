import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHref, hasNoindex, livePageBlockingIssues } from './seo-live-page-policy.mjs';

const SHORT_NEWS = {
  url: 'https://trrb.net/us-news/short', status: 200,
  title: '美国短讯', description: '事件最新进展。', h1: '美国短讯',
  canonical: 'https://trrb.net/us-news/short', noindex: false, missingAlt: 0,
};

test('nonempty short headline and description pass without a length gate', () => {
  assert.deepEqual(livePageBlockingIssues(SHORT_NEWS), []);
});

test('empty titles and descriptions still fail', () => {
  assert.deepEqual(livePageBlockingIssues({ ...SHORT_NEWS, title: '', description: '  ' }), ['title missing', 'description missing']);
});

test('sitemap presence cannot override noindex or a different/missing canonical', () => {
  assert.deepEqual(livePageBlockingIssues({ ...SHORT_NEWS, noindex: true }), ['noindex']);
  assert.deepEqual(livePageBlockingIssues({ ...SHORT_NEWS, canonical: 'https://trrb.net/' }), ['canonical mismatch: https://trrb.net/']);
  assert.deepEqual(livePageBlockingIssues({ ...SHORT_NEWS, canonical: '' }), ['canonical mismatch: missing']);
  assert.deepEqual(livePageBlockingIssues({ ...SHORT_NEWS, canonical: '/us-news/short' }), []);
});

test('robots parsing handles reversed attributes, crawler-specific tags and response headers', () => {
  assert.equal(hasNoindex('<meta content="noindex, follow" name="robots">'), true);
  assert.equal(hasNoindex('<meta name="googlebot" content="noindex">'), true);
  assert.equal(hasNoindex('<meta name="robots" content="none">'), true);
  assert.equal(hasNoindex('', { 'X-Robots-Tag': 'noindex, follow' }), true);
  assert.equal(hasNoindex('<meta name="description" content="noindex policy">'), false);
  assert.equal(hasNoindex('<meta name="robots" content="index, follow">'), false);
});

test('HTML-encoded canonical query strings compare against the requested URL', () => {
  const canonical = canonicalHref('<link href="https://trrb.net/list?a=1&amp;b=2" rel="canonical">');
  assert.equal(canonical, 'https://trrb.net/list?a=1&b=2');
  assert.deepEqual(livePageBlockingIssues({ ...SHORT_NEWS, url: canonical, canonical }), []);
});
