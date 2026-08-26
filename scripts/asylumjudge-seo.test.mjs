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

const nationalityUrls = allUrls.filter((url) => /\/nationalities\//.test(new URL(url).pathname));
assert.ok(nationalityUrls.length >= 2000, 'localized nationality dataset pages must be generated');
for (const url of nationalityUrls) {
  const pathname = new URL(url).pathname;
  const html = await read(`${pathname.replace(/^\//, '').replace(/\/$/, '')}/index.html`);
  const json = html.match(/<script type="application\/ld\+json" data-seo-generated>([\s\S]*?)<\/script>/)?.[1];
  const graph = JSON.parse(json || '{}')['@graph'] || [];
  const dataset = graph.find((item) => item['@type'] === 'Dataset');
  assert.ok(dataset, `${url} must contain a Dataset entity`);
  assert.ok(dataset.description.length >= 50 && dataset.description.length <= 5000, `${url} Dataset description must contain 50–5000 characters`);
  assert.equal(dataset.license?.url, 'https://asylumjudge.com/methodology/#data-license', `${url} must identify the data license`);
  assert.equal(dataset.isAccessibleForFree, true, `${url} must identify free access`);
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

const methodology = await read('methodology/index.html');
assert.match(methodology, /id="data-license"/, 'methodology must expose the Dataset license target');

const backgroundDirectory = await read('judge-backgrounds/index.html');
assert.match(backgroundDirectory, /<link rel="canonical" href="https:\/\/asylumjudge\.com\/judge-backgrounds\/">/);
assert.ok((backgroundDirectory.match(/class="background-directory-card"/g) || []).length >= 400, 'background directory must expose at least 400 verified judge profiles');
assert.match(backgroundDirectory, /href="\/judges\/.+--[a-z0-9]+\/"/, 'background directory cards must link to canonical judge pages');

const englishJudgeFiles = allUrls.filter((url) => /\/en\/judges\//.test(url));
let verifiedBackgroundPage = null;
for (const url of englishJudgeFiles) {
  const pathname = new URL(url).pathname;
  const html = await read(`${pathname.replace(/^\//, '').replace(/\/$/, '')}/index.html`);
  if (html.includes('id="judge-background" class="detail-section judge-background">')) {
    verifiedBackgroundPage = { url, html };
    break;
  }
}
assert.ok(verifiedBackgroundPage, 'at least one generated judge page must expose an official background');
assert.match(verifiedBackgroundPage.html, /<p id="background-bio">[^<]{120,}<\/p>/, 'official biography must be present in static HTML');
assert.match(verifiedBackgroundPage.html, /<a id="background-source" href="https:\/\/www\.justice\.gov\//, 'static biography must link to its DOJ source');
const verifiedJson = verifiedBackgroundPage.html.match(/<script type="application\/ld\+json" data-seo-generated>([\s\S]*?)<\/script>/)?.[1];
const verifiedPerson = (JSON.parse(verifiedJson || '{}')['@graph'] || []).find((item) => item['@type'] === 'Person');
assert.ok(verifiedPerson?.description?.includes('appointed'), 'Person schema must contain the verified appointment biography');
assert.ok(verifiedPerson?.sameAs?.[0]?.startsWith('https://www.justice.gov/'), 'Person schema must cite its official DOJ source');

const headers = await read('_headers');
assert.match(headers, /\/judge\s+X-Robots-Tag: noindex, follow/);
assert.match(headers, /\/\*\/judge\s+X-Robots-Tag: noindex, follow/);

console.log(`AsylumJudge SEO contract: PASS (${allUrls.length.toLocaleString()} canonical URLs checked)`);
