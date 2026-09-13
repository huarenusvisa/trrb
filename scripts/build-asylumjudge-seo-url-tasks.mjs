import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, '.netlify', 'asylumjudge-bundle', 'public');
const SOURCE = join(ROOT, 'asylumjudge', 'seo-url-tasks.json');
const ORIGIN = 'https://asylumjudge.com';
const ADDED = new Set([
  ORIGIN + '/asylum-judge-approval-rate/',
  ORIGIN + '/en/asylum-judge-rating/'
]);
const SITEMAPS = [
  ORIGIN + '/sitemap.xml',
  ORIGIN + '/sitemap-static.xml',
  ORIGIN + '/sitemap-judges.xml',
  ORIGIN + '/sitemap-courts.xml',
  ORIGIN + '/sitemap-nationalities.xml'
];
const REDIRECTS = [
  ['/hot-headlines', 'https://trrb.net/hot-headlines'],
  ['/us-politics', 'https://trrb.net/us-politics'],
  ['/us-crime', 'https://trrb.net/us-crime'],
  ['/ice', 'https://trrb.net/ice'],
  ['/immigrate/center', 'https://trrb.net/immigrate/center'],
  ['/immigrate/', 'https://trrb.net/immigrate/'],
  ['/huarengongzuo/', 'https://trrb.net/huarengongzuo/'],
  ['/jobs/', 'https://trrb.net/jobs/'],
  ['/legal/', 'https://trrb.net/legal/'],
  ['/privacy.html', 'https://trrb.net/privacy.html'],
  ['/terms.html', 'https://trrb.net/terms.html']
].map(([path, target]) => ({ url: ORIGIN + path, target, status: 301 }));

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim());
}

async function walkHtml(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walkHtml(path, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

function metaValue(html, name) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = (tag.match(/\bname\s*=\s*(["'])([\s\S]*?)\1/i) || [])[2] || '';
    if (key.toLowerCase() !== name.toLowerCase()) continue;
    const value = tag.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i);
    if (value) return value[2];
  }
  return '';
}

function canonicalValue(html) {
  const tag = (html.match(/<link\b[^>]*\brel\s*=\s*(["'])canonical\1[^>]*>/i) || [])[0] || '';
  return (tag.match(/\bhref\s*=\s*(["'])([\s\S]*?)\1/i) || [])[2] || '';
}

async function buildManifest() {
  const sitemapFiles = ['sitemap-static.xml', 'sitemap-judges.xml', 'sitemap-courts.xml', 'sitemap-nationalities.xml'];
  const canonical = new Set();
  for (const file of sitemapFiles) {
    const xml = await readFile(join(OUT, file), 'utf8');
    for (const url of extractLocs(xml)) canonical.add(url);
  }

  const removeFromIndex = new Set();
  for (const path of await walkHtml(OUT)) {
    const html = await readFile(path, 'utf8');
    if (!/^noindex,follow/i.test(metaValue(html, 'robots'))) continue;
    const url = canonicalValue(html);
    if (url.startsWith(ORIGIN + '/')) removeFromIndex.add(url);
  }

  const add = [...ADDED].sort();
  const update = [...canonical]
    .filter((url) => !ADDED.has(url))
    .concat(REDIRECTS.map((item) => item.url))
    .sort();
  const remove = [...removeFromIndex].sort();
  const generatedAt = new Date().toISOString();
  const manifest = {
    schema_version: 1,
    task_id: 'asylumjudge-seo-' + generatedAt.slice(0, 10),
    site: 'AsylumJudge',
    origin: ORIGIN,
    generated_at: generatedAt,
    status: 'pending_central_seo_robot',
    external_submission_performed: false,
    consumer: 'central SEO robot',
    counts: { add: add.length, update: update.length, delete: remove.length, redirects: REDIRECTS.length },
    sitemaps: SITEMAPS,
    redirects: REDIRECTS,
    actions: {
      add: { urls: add },
      update: {
        canonical_url_sources: SITEMAPS.slice(1),
        redirect_urls: REDIRECTS.map((item) => item.url),
        exclude_urls: add,
        expected_count: update.length
      },
      delete: {
        robots_match: 'noindex,follow',
        locale_prefixes: ['pt-br', 'hi', 'zh-hant', 'ru', 'ar', 'tr'],
        entity_segments: ['judges', 'courts', 'nationalities'],
        url_pattern: 'https://asylumjudge.com/{locale}/{entity}/{slug}/',
        expected_count: remove.length,
        meaning: 'Remove from searchable index only; pages remain available to users.'
      }
    },
    materialization: {
      command: 'node scripts/build-asylumjudge-seo-url-tasks.mjs',
      expanded_bundle_path: '/asylumjudge/seo-url-tasks-expanded.json'
    }
  };
  const expanded = {
    schema_version: 1,
    task_id: manifest.task_id,
    generated_at: generatedAt,
    external_submission_performed: false,
    actions: { add, update, delete: remove }
  };
  return { manifest, expanded };
}

const { manifest, expanded } = await buildManifest();
const json = JSON.stringify(manifest, null, 2) + '\n';
const outputPath = join(OUT, 'asylumjudge', 'seo-url-tasks.json');
const expandedPath = join(OUT, 'asylumjudge', 'seo-url-tasks-expanded.json');
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, json);
await writeFile(expandedPath, JSON.stringify(expanded, null, 2) + '\n');
if (process.argv.includes('--write-source')) await writeFile(SOURCE, json);
console.log(
  'AsylumJudge SEO task manifest: ' +
  manifest.counts.add + ' add, ' +
  manifest.counts.update + ' update, ' +
  manifest.counts.delete + ' delete/noindex, ' +
  manifest.counts.redirects + ' redirects; no external submission performed.'
);
