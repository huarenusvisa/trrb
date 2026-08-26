import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.netlify', 'asylumjudge-bundle', 'public');
const host = 'asylumjudge.com';
const key = '8d42a4dac6059bb279cede8301423e6d';
const keyLocation = `https://${host}/${key}.txt`;
const sitemapFiles = ['sitemap-static.xml', 'sitemap-judges.xml', 'sitemap-courts.xml', 'sitemap-nationalities.xml'];
const urls = [];

for (const filename of sitemapFiles) {
  const xml = await readFile(join(output, filename), 'utf8');
  urls.push(...[...xml.matchAll(/<loc>(https:\/\/asylumjudge\.com[^<]+)<\/loc>/g)].map((match) => match[1]));
}

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ host, keyLocation, urls: urls.length, batches: Math.ceil(urls.length / 9000) }, null, 2));
  process.exit(0);
}

for (let index = 0; index < urls.length; index += 9000) {
  const urlList = urls.slice(index, index + 9000);
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation, urlList }),
    signal: AbortSignal.timeout(60000)
  });
  if (![200, 202].includes(response.status)) {
    throw new Error(`IndexNow batch ${Math.floor(index / 9000) + 1} returned ${response.status}: ${await response.text()}`);
  }
  console.log(`IndexNow accepted ${urlList.length} URLs (${response.status})`);
}
