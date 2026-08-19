#!/usr/bin/env node
import fs from 'node:fs';

const HOST = 'trrb.net';
const ORIGIN = `https://${HOST}`;
const KEY = '9d4f7b8c6a2e41d39b7c5e8f1a6d3c20';
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;
const MAX = 10000;

function decodeXml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function canonicalize(value) {
  try {
    const url = new URL(value);
    if (!['trrb.net', 'www.trrb.net'].includes(url.hostname)) return '';
    url.protocol = 'https:';
    url.hostname = HOST;
    url.port = '';
    url.hash = '';
    // Never teach Bing a new legacy query URL. Restored old URLs are handled by
    // 301/410 at request time, while IndexNow receives only current canonicals.
    if (/\/article\.html$/i.test(url.pathname) && url.searchParams.has('id')) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => canonicalize(decodeXml(match[1].trim())))
    .filter(Boolean);
}

const candidates = new Set();

// Fresh news first. IndexNow accepts at most 10,000 URLs per request, so the
// Google News feed must never be crowded out by a large historical sitemap.
if (fs.existsSync('news-sitemap.xml')) {
  extractLocs(fs.readFileSync('news-sitemap.xml', 'utf8')).forEach((url) => candidates.add(url));
}
candidates.add(`${ORIGIN}/`);
if (fs.existsSync('sitemap.xml')) {
  extractLocs(fs.readFileSync('sitemap.xml', 'utf8')).forEach((url) => candidates.add(url));
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
const freshNewsCount = fs.existsSync('news-sitemap.xml') ? extractLocs(fs.readFileSync('news-sitemap.xml','utf8')).length : 0;
console.log(`IndexNow提交 ${urls.length} 个规范URL（最新新闻优先 ${Math.min(freshNewsCount, urls.length)} 条）：HTTP ${response.status}${text ? ` ${text.slice(0, 300)}` : ''}`);
if (![200, 202].includes(response.status)) process.exit(1);
