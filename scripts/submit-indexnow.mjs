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
    url.hash = '';
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

const candidates = new Set([`${ORIGIN}/`]);
for (const file of ['sitemap.xml', 'news-sitemap.xml']) {
  if (!fs.existsSync(file)) continue;
  extractLocs(fs.readFileSync(file, 'utf8')).forEach((url) => candidates.add(url));
}

const urls = [...candidates].slice(0, MAX);
if (!urls.length) {
  console.log('没有可提交的URL');
  process.exit(0);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls })
});

const text = await response.text();
console.log(`IndexNow提交 ${urls.length} 个规范URL：HTTP ${response.status}${text ? ` ${text.slice(0, 300)}` : ''}`);
if (![200, 202].includes(response.status)) process.exit(1);
