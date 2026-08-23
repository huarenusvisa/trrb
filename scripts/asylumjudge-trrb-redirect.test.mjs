import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const filesWithPublicEntryPoints = [
  'index.html',
  'article.html',
  'listing.html',
  'immigrate/index.html',
  'homepage-immigration-hub.js'
];

for (const file of filesWithPublicEntryPoints) {
  const source = readFileSync(file, 'utf8');
  assert.match(source, /https:\/\/asylumjudge\.com\//, `${file} must link directly to AsylumJudge.com`);
  assert.doesNotMatch(source, /href=["']\/asylumjudge(?:[\/"'])/, `${file} must not link to the retired TRRB copy`);
}

const redirects = readFileSync('_redirects', 'utf8');
const requiredRedirects = [
  '/asylumjudge https://asylumjudge.com/ 301!',
  '/asylumjudge/judge https://asylumjudge.com/judge 301!',
  '/asylumjudge/courts https://asylumjudge.com/courts 301!',
  '/asylumjudge/states https://asylumjudge.com/states 301!',
  '/asylumjudge/nationality https://asylumjudge.com/nationality 301!',
  '/immigration-judge-approval-rate/detail.html https://asylumjudge.com/judge 301!',
  '/immigration-judge-approval-rate/china-dashboard.html https://asylumjudge.com/nationality 301!'
];

for (const rule of requiredRedirects) {
  assert.ok(redirects.split(/\r?\n/).includes(rule), `missing redirect: ${rule}`);
}

assert.doesNotMatch(redirects, /^\/asylumjudge(?:\/)?\s+\/asylumjudge\/trrb\.html\s+200!/m, 'TRRB copy must not be served');

const sitemap = readFileSync('sitemap.xml', 'utf8');
assert.doesNotMatch(sitemap, /https:\/\/trrb\.net\/(?:asylumjudge|immigration-judge-approval-rate)/, 'retired TRRB copy must not remain in sitemap');

console.log('TRRB AsylumJudge entry points and redirects are canonical.');
