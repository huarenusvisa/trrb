import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ops = await readFile('scripts/asylumjudge-search-engine-ops.mjs', 'utf8');
const workflow = await readFile('.github/workflows/seo-search-engine-ops.yml', 'utf8');

assert.match(ops, /webmasters\.sitemaps\.submit\(\{ siteUrl: GSC_SITE_URL, feedpath: SITEMAP \}\)/, 'Google must receive the AsylumJudge sitemap through Search Console');
assert.match(ops, /bingCall\('SubmitFeed'/, 'Bing must receive the AsylumJudge sitemap');
assert.match(ops, /bingCall\('SubmitUrlBatch'/, 'Bing must receive the priority URL batch');
assert.match(ops, /\/eoir-case-status\//);
assert.match(ops, /\/ice-detainee-locator\//);
assert.match(ops, /\/eoir-33-change-address\//);
assert.match(ops, /\/uscis-case-status\//);
assert.match(ops, /\/immigration-court-asylum-fee\//);
assert.doesNotMatch(ops, /indexing\.urlNotifications\.publish/, 'Google Indexing API must not be used for general immigration pages');

assert.match(workflow, /Wait for new AsylumJudge priority pages to reach production/);
assert.match(workflow, /ASLYUMJUDGE_GOOGLE_SEARCH_CONSOLE_SITE_URL|ASYLUMJUDGE_GOOGLE_SEARCH_CONSOLE_SITE_URL/);
assert.match(workflow, /SEO_REQUIRE_GOOGLE: 'true'/);
assert.match(workflow, /SEO_REQUIRE_BING: 'true'/);
assert.match(workflow, /node scripts\/asylumjudge-search-engine-ops\.mjs/);

console.log('AsylumJudge Google/Bing search-engine operations contract: PASS');
