import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.netlify', 'asylumjudge-bundle', 'public');
const host = 'asylumjudge.com';
const origin = `https://${host}`;
const key = '8d42a4dac6059bb279cede8301423e6d';
const keyLocation = `${origin}/${key}.txt`;
const sitemapFiles = ['sitemap-static.xml', 'sitemap-judges.xml', 'sitemap-courts.xml', 'sitemap-nationalities.xml'];
const useLive = process.argv.includes('--live');
const urls = [];

for (const filename of sitemapFiles) {
  let xml;
  if (useLive) {
    const response = await fetch(`${origin}/${filename}?indexnow=${Date.now()}`, {
      headers: { 'user-agent': 'TRRB-AsylumJudge-SEO-Robot/1.0', 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Live ${filename} returned HTTP ${response.status}`);
    xml = await response.text();
  } else {
    xml = await readFile(join(output, filename), 'utf8');
  }
  urls.push(...[...xml.matchAll(/<loc>(https:\/\/asylumjudge\.com[^<]+)<\/loc>/g)].map((match) => match[1]));
}

const cleanUrls = [...new Set(urls)].filter((raw) => {
  try {
    const url = new URL(raw);
    return url.origin === origin
      && !url.search
      && !/\.html(?:$|\/)/i.test(url.pathname)
      && !/^\/(?:judge|court)\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
});

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ host, source: useLive ? 'live' : 'build', keyLocation, urls: cleanUrls.length, batches: Math.ceil(cleanUrls.length / 9000) }, null, 2));
  process.exit(0);
}

for (let index = 0; index < cleanUrls.length; index += 9000) {
  const urlList = cleanUrls.slice(index, index + 9000);
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation, urlList }),
    signal: AbortSignal.timeout(60000)
  });
  if (![200, 202].includes(response.status)) {
    throw new Error(`IndexNow batch ${Math.floor(index / 9000) + 1} returned ${response.status}: ${await response.text()}`);
  }
  console.log(`IndexNow accepted ${urlList.length} live canonical URLs (${response.status})`);
}
