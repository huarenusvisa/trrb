import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('public immigration navigation opens the knowledge base', async () => {
  const [home, article, listing, redirects, optimizer, legacyEntry, channels, categoryApi] = await Promise.all([
    read('index.html'),
    read('article.html'),
    read('listing.html'),
    read('_redirects'),
    read('scripts/optimize-homepage-performance.mjs'),
    read('immigration-entry.js'),
    read('config/channels.js'),
    read('netlify/functions/public-category-page.js')
  ]);

  for (const html of [home, article, listing]) {
    assert.match(html, /href="\/immigrate\/">移民美国知识库<\/a>/);
  }
  assert.match(redirects, /^\/immigration \/immigrate\/ 301!$/m);
  assert.match(redirects, /^\/immigration\/ \/immigrate\/ 301!$/m);
  assert.doesNotMatch(redirects, /^\/immigration \/listing\.html/m);
  assert.doesNotMatch(optimizer, /<a href="\/immigrate\/">移民美国<\/a>', '<a href="\/immigration">移民美国<\/a>/);
  assert.match(legacyEntry, /window\.location\.replace\('\/immigrate\/'\)/);
  assert.doesNotMatch(channels, /name:\s*["']移民美国["']/);
  assert.doesNotMatch(categoryApi, /\["移民美国",\s*\{\s*path:\s*"\/immigration"/);
});

test('community opens directly on the boards without the promotional hero', async () => {
  const [community, script] = await Promise.all([
    read('community/index.html'),
    read('community/community.js')
  ]);
  assert.doesNotMatch(community, /class="hero"/);
  assert.doesNotMatch(community, /id="uscis-data"/);
  assert.doesNotMatch(community, /id="hero-publish"/);
  assert.doesNotMatch(script, /\$\('hero-publish'\)\.addEventListener/);
});
