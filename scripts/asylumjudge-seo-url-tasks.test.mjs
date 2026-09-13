import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, '.netlify', 'asylumjudge-bundle', 'public');
const manifest = JSON.parse(await readFile(join(ROOT, 'asylumjudge', 'seo-url-tasks.json'), 'utf8'));
const expanded = JSON.parse(await readFile(join(OUT, 'asylumjudge', 'seo-url-tasks-expanded.json'), 'utf8'));
const sitemapFiles = ['sitemap-static.xml', 'sitemap-judges.xml', 'sitemap-courts.xml', 'sitemap-nationalities.xml'];
const sitemapUrls = new Set();
for (const file of sitemapFiles) {
  const xml = await readFile(join(OUT, file), 'utf8');
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapUrls.add(match[1].trim());
}

assert.equal(manifest.schema_version, 1);
assert.equal(manifest.origin, 'https://asylumjudge.com');
assert.equal(manifest.status, 'pending_central_seo_robot');
assert.equal(manifest.external_submission_performed, false);

for (const action of ['add', 'update', 'delete']) {
  const urls = expanded.actions[action];
  assert.ok(Array.isArray(urls), action + ' must be an array');
  assert.equal(urls.length, manifest.counts[action], action + ' count must match');
  assert.equal(new Set(urls).size, urls.length, action + ' URLs must be unique');
  assert.deepEqual([...urls].sort(), urls, action + ' URLs must be deterministic and sorted');
  assert.ok(urls.every((url) => url.startsWith(manifest.origin + '/')), action + ' URLs must belong to AsylumJudge');
}

const add = new Set(expanded.actions.add);
const update = new Set(expanded.actions.update);
const remove = new Set(expanded.actions.delete);
for (const url of add) {
  assert.ok(sitemapUrls.has(url), 'added canonical must appear in a sitemap: ' + url);
  assert.ok(!update.has(url) && !remove.has(url), 'added URL must not appear in another action: ' + url);
}

for (const url of remove) {
  assert.ok(!sitemapUrls.has(url), 'delete/noindex URL must not remain in a sitemap: ' + url);
  const pathname = new URL(url).pathname.replace(/^\/|\/$/g, '');
  const htmlPath = join(OUT, pathname, 'index.html');
  await access(htmlPath);
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /<meta name="robots" content="noindex,follow,max-image-preview:large">/);
  assert.ok(!add.has(url) && !update.has(url), 'delete/noindex URL must not appear in another action: ' + url);
}

assert.equal(manifest.redirects.length, manifest.counts.redirects);
assert.deepEqual(manifest.actions.add.urls, expanded.actions.add);
assert.equal(manifest.actions.update.expected_count, expanded.actions.update.length);
assert.equal(manifest.actions.delete.expected_count, expanded.actions.delete.length);
for (const redirect of manifest.redirects) {
  assert.equal(redirect.status, 301);
  assert.ok(update.has(redirect.url), 'redirect source must appear in update actions: ' + redirect.url);
}

console.log(
  'AsylumJudge SEO URL task manifest: PASS (' +
  manifest.counts.add + ' add, ' +
  manifest.counts.update + ' update, ' +
  manifest.counts.delete + ' delete/noindex, ' +
  manifest.counts.redirects + ' redirects)'
);
