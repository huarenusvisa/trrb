import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const optional = (path) => fs.existsSync(path) ? read(path) : '';

const appCategories = read('apps/mobile/src/news/categories.ts');
const channels = read('config/channels.js');
const redirects = read('_redirects');
const homepage = read('index.html');
const listing = read('listing.html');
const article = read('article.html');
const immigrationHub = read('immigrate/index.html');
const feed = optional('feed.xml');
const sitemap = optional('sitemap.xml');
const googleNews = optional('google-news-sitemap.xml') || optional('news-sitemap.xml') || optional('google-news.xml');

const topLevelSources = [
  ['APP categories', appCategories],
  ['homepage channel config', channels],
  ['homepage navigation', homepage],
  ['listing navigation', listing],
  ['article navigation', article],
  ['immigration hub navigation', immigrationHub]
];

const failures = [];
for (const [name, source] of topLevelSources) {
  if (/href=["']\/asylum(?:["'/?#])/.test(source) || /label:\s*["']庇护百科["']/.test(source) || /name:\s*["']庇护百科["']/.test(source)) {
    failures.push(`${name} still exposes retired asylum encyclopedia as a top-level entry`);
  }
}

if (!/^\/asylum\s+\/immigrate\/center\?path=humanitarian\s+301!$/m.test(redirects)) {
  failures.push('missing /asylum -> humanitarian knowledge center 301');
}
if (!/^\/asylum\/:slug\s+\/immigration\/:slug\s+301!$/m.test(redirects)) {
  failures.push('missing /asylum/:slug -> /immigration/:slug 301');
}
if (/\/asylum\s+\/listing\.html\?category=.*(?:E5|庇护)/i.test(redirects)) {
  failures.push('legacy /asylum internal rewrite is still present');
}

for (const [name, source] of [['RSS', feed], ['Sitemap', sitemap], ['Google News', googleNews]]) {
  if (!source) continue;
  if (/<category>\s*庇护百科\s*<\/category>/i.test(source) || /https?:\/\/[^<\s]*\/asylum(?:[\/<\s])/i.test(source)) {
    failures.push(`${name} still exposes retired asylum encyclopedia route/category`);
  }
}

if (!/if\s*\(value\s*===\s*["']庇护百科["']\)\s*return\s*["']移民美国["']/.test(appCategories)) {
  failures.push('APP legacy category resolver does not map 庇护百科 to 移民美国');
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`APP-R2 ASYLUM RETIREMENT: FAIL (${failures.length})`);
  process.exit(1);
}

console.log('PASS: retired asylum encyclopedia is absent from top-level APP/web navigation');
console.log('PASS: legacy /asylum routes have permanent redirects');
console.log('PASS: static RSS/Sitemap/Google News surfaces do not expose retired category routes');
console.log('PASS: APP legacy category values resolve into 移民美国');
console.log('APP-R2 ASYLUM RETIREMENT: PASS');
