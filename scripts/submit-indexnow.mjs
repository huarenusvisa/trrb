#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const HOST = 'trrb.net';
const ORIGIN = `https://${HOST}`;
const KEY = '9d4f7b8c6a2e41d39b7c5e8f1a6d3c20';
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;
const MAX = 10000;
const ROOT = process.cwd();
const INCLUDE_RETIRED = /^(?:1|true|yes)$/i.test(String(process.env.INDEXNOW_INCLUDE_RETIRED || ''));
const FULL_SYNC = /^(?:1|true|yes)$/i.test(String(process.env.INDEXNOW_FULL_SYNC || ''));
const USE_LIVE_NEWS = !/^(?:0|false|no)$/i.test(String(process.env.INDEXNOW_USE_LIVE_NEWS || 'true'));
const INCLUDE_HOME = /^(?:1|true|yes)$/i.test(String(process.env.INDEXNOW_INCLUDE_HOME || ''));
const FRESH_HOURS = Math.max(1, Math.min(48, Number(process.env.INDEXNOW_FRESH_HOURS || 3)));
const CHANGED_URLS_FILE = String(process.env.INDEXNOW_CHANGED_URLS_FILE || '').trim();
const RETIRED_FILE = 'retired-indexnow-urls.txt';

function decodeXml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function rawLocs(xml) {
  return [...String(xml || '').matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeXml(match[1].trim()))
    .filter(Boolean);
}

function canonicalize(value) {
  try {
    const url = new URL(value);
    if (!['trrb.net', 'www.trrb.net'].includes(url.hostname)) return '';
    url.protocol = 'https:';
    url.hostname = HOST;
    url.port = '';
    url.hash = '';
    // Never teach Bing a legacy query URL as a current canonical. Explicitly
    // retired URLs are handled separately below and are allowed to preserve the
    // old query so crawlers can observe their 301/404/410/noindex state.
    if (/\/article\.html$/i.test(url.pathname) && url.searchParams.has('id')) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function canonicalizeRetired(value) {
  try {
    const url = new URL(value);
    if (url.hostname !== HOST) return '';
    url.protocol = 'https:';
    url.port = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function extractLocs(xml) {
  return rawLocs(xml).map(canonicalize).filter(Boolean);
}

function extractFreshNewsUrls(xml) {
  const cutoff = Date.now() - FRESH_HOURS * 60 * 60 * 1000;
  const blocks = String(xml || '').match(/<url>[\s\S]*?<\/url>/gi) || [];
  const urls = [];
  for (const block of blocks) {
    const published = block.match(/<news:publication_date>([^<]+)<\/news:publication_date>/i)?.[1]?.trim();
    const timestamp = Date.parse(published || '');
    if (!Number.isFinite(timestamp) || timestamp < cutoff || timestamp > Date.now() + 300000) continue;
    const loc = rawLocs(block).map(canonicalize).find(Boolean);
    if (loc) urls.push(loc);
  }
  return urls;
}

async function loadFreshNewsUrls() {
  if (USE_LIVE_NEWS) {
    try {
      const response = await fetch(`${ORIGIN}/news-sitemap.xml?indexnow=${Date.now()}`, {
        cache: 'no-store',
        headers: { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1', 'cache-control': 'no-cache' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const urls = extractFreshNewsUrls(await response.text());
      console.log(`IndexNow实时新闻窗口：最近 ${FRESH_HOURS} 小时，共 ${urls.length} 个URL`);
      return urls;
    } catch (error) {
      console.warn(`实时News Sitemap读取失败，回退本地文件：${error.message}`);
    }
  }
  if (!fs.existsSync('news-sitemap.xml')) return [];
  return extractFreshNewsUrls(fs.readFileSync('news-sitemap.xml', 'utf8'));
}

function retiredUrls() {
  if (!INCLUDE_RETIRED || !fs.existsSync(RETIRED_FILE)) return [];
  return fs.readFileSync(RETIRED_FILE, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map(canonicalizeRetired)
    .filter(Boolean);
}

function changedUrls() {
  if (!CHANGED_URLS_FILE || !fs.existsSync(CHANGED_URLS_FILE)) return [];
  return fs.readFileSync(CHANGED_URLS_FILE, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map(canonicalizeRetired)
    .filter(Boolean);
}

function localSitemapPath(value) {
  try {
    const url = new URL(value);
    if (!['trrb.net', 'www.trrb.net'].includes(url.hostname)) return '';
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!relative || relative.includes('..') || !/\.xml$/i.test(relative)) return '';
    const resolved = path.resolve(ROOT, relative);
    if (!resolved.startsWith(`${ROOT}${path.sep}`) && resolved !== ROOT) return '';
    return resolved;
  } catch {
    return '';
  }
}

function collectSitemapUrls(filename, seen = new Set()) {
  const absolute = path.resolve(ROOT, filename);
  if (seen.has(absolute) || !fs.existsSync(absolute)) return [];
  seen.add(absolute);
  const xml = fs.readFileSync(absolute, 'utf8');

  if (/<sitemapindex\b/i.test(xml)) {
    const urls = [];
    for (const loc of rawLocs(xml)) {
      const child = localSitemapPath(loc);
      if (!child || !fs.existsSync(child)) continue;
      urls.push(...collectSitemapUrls(path.relative(ROOT, child), seen));
    }
    return urls;
  }

  return extractLocs(xml);
}

const candidates = new Set();

// Fresh news always wins the crawl budget.
const freshNewsUrls = await loadFreshNewsUrls();
freshNewsUrls.forEach((url) => candidates.add(url));

// Deleted/redirected URLs are inserted before the historical sitemap only on
// change/manual runs, so Bing can discover their retirement promptly without
// resubmitting them every 15 minutes forever.
const retired = retiredUrls();
retired.forEach((url) => candidates.add(url));

// Migration and publishing workflows can provide an exact change queue. This
// keeps IndexNow focused on real additions, redirects and removals instead of
// spending crawl quota on the complete unchanged archive every hour.
const changed = changedUrls();
changed.forEach((url) => candidates.add(url));

if (INCLUDE_HOME) candidates.add(`${ORIGIN}/`);

// split-sitemap-index.mjs may convert sitemap.xml into a sitemapindex before
// this script runs. Follow local child sitemaps recursively so IndexNow still
// receives article canonicals rather than only sitemap-articles-N.xml URLs.
if (FULL_SYNC && fs.existsSync('sitemap.xml')) {
  collectSitemapUrls('sitemap.xml').forEach((url) => candidates.add(url));
}

const urls = [...candidates].slice(0, MAX);
if (!urls.length) {
  console.log('没有可提交的URL');
  process.exit(0);
}

// Fail early if the public verification key disappeared; otherwise repeated
// IndexNow POSTs would look healthy locally while search engines reject them.
const keyCheck = await fetch(KEY_LOCATION, { cache: 'no-store' });
const keyBody = keyCheck.ok ? (await keyCheck.text()).trim() : '';
if (!keyCheck.ok || keyBody !== KEY) {
  throw new Error(`IndexNow key verification failed: HTTP ${keyCheck.status}; body=${keyBody.slice(0,80)}`);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls })
});

const text = await response.text();
console.log(`IndexNow提交 ${urls.length} 个URL（最近${FRESH_HOURS}小时新闻 ${freshNewsUrls.length}；变更队列 ${changed.length}；本次退役通知 ${retired.length}；全站同步 ${FULL_SYNC ? '是' : '否'}）：HTTP ${response.status}${text ? ` ${text.slice(0, 300)}` : ''}`);
if (![200, 202].includes(response.status)) process.exit(1);
