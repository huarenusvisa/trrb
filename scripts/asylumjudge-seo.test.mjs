import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const output = join(process.cwd(), '.netlify', 'asylumjudge-bundle', 'public');
const read = (relative) => readFile(join(output, relative), 'utf8');
const exists = async (relative) => {
  try {
    await access(join(output, relative));
    return true;
  } catch {
    return false;
  }
};

const sitemapIndex = await read('sitemap.xml');
for (const shard of ['static', 'judges', 'courts', 'nationalities']) {
  assert.match(sitemapIndex, new RegExp(`<loc>https://asylumjudge\\.com/sitemap-${shard}\\.xml</loc>`));
}

const sitemapFiles = [
  ['sitemap-static.xml', 50],
  ['sitemap-judges.xml', 1000],
  ['sitemap-courts.xml', 500],
  ['sitemap-nationalities.xml', 2000]
];
const allUrls = [];
for (const [file, minimum] of sitemapFiles) {
  const xml = await read(file);
  const urls = [...xml.matchAll(/<loc>(https:\/\/asylumjudge\.com[^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.ok(urls.length >= minimum, `${file} should contain at least ${minimum} URLs`);
  assert.ok(urls.every((url) => !url.includes('?')), `${file} may not contain query-string URLs`);
  allUrls.push(...urls);
}
assert.equal(new Set(allUrls).size, allUrls.length, 'sitemaps may not contain duplicate canonical URLs');

for (const url of allUrls) {
  const pathname = new URL(url).pathname;
  const relative = pathname === '/' ? 'index.html' : `${pathname.replace(/^\//, '').replace(/\/$/, '')}/index.html`;
  assert.ok(await exists(relative), `sitemap URL must have a generated page: ${url}`);
}

const judgeUrl = allUrls.find((url) => /\/en\/judges\//.test(url));
const courtUrl = allUrls.find((url) => /\/es\/courts\/.+--/.test(url));
const nationalityUrl = allUrls.find((url) => /\/ar\/nationalities\//.test(url));
assert.ok(judgeUrl && courtUrl && nationalityUrl, 'entity sitemaps must include localized pretty URLs');

for (const url of [judgeUrl, courtUrl, nationalityUrl]) {
  const pathname = new URL(url).pathname;
  const html = await read(`${pathname.replace(/^\//, '').replace(/\/$/, '')}/index.html`);
  assert.match(html, new RegExp(`<link rel="canonical" href="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  assert.match(html, /<meta name="robots" content="index,follow,/);
  assert.doesNotMatch(html, /<meta name="robots" content="noindex/i);
  assert.equal((html.match(/rel="alternate" hreflang=/g) || []).length, 11, 'each page needs ten locale alternates plus x-default');
  assert.equal((html.match(/type="application\/ld\+json"/g) || []).length, 1, 'each page should have one JSON-LD graph');
  const json = html.match(/<script type="application\/ld\+json" data-seo-generated>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(json, 'page should have generated JSON-LD');
  assert.doesNotThrow(() => JSON.parse(json), 'JSON-LD must be valid JSON');
}

const englishHome = await read('en/index.html');
assert.match(englishHome, /<html lang="en">/);
assert.match(englishHome, /<title>U\.S\. Immigration Judge Approval Rates/);
assert.match(englishHome, /hreflang="pt-BR" href="https:\/\/asylumjudge\.com\/pt-br\/"/);

const arabicNationality = await read(`${new URL(nationalityUrl).pathname.replace(/^\//, '').replace(/\/$/, '')}/index.html`);
assert.match(arabicNationality, /<html lang="ar" dir="rtl">/);
assert.match(arabicNationality, /<body data-country="[^"]+" data-seo-prerendered="true">/);
assert.match(arabicNationality, /<h1>[^<]+<\/h1>/, 'entity H1 must remain country-specific after client translations load');
assert.doesNotMatch(arabicNationality, /<h1 data-i18n="heroTitle">/, 'entity H1 must not be replaced by the generic nationality title');

const headers = await read('_headers');
assert.match(headers, /\/judge\s+X-Robots-Tag: noindex, follow/);
assert.match(headers, /\/\*\/judge\s+X-Robots-Tag: noindex, follow/);

console.log(`AsylumJudge SEO contract: PASS (${allUrls.length.toLocaleString()} canonical URLs checked)`);
