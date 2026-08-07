#!/usr/bin/env node
import fs from 'node:fs';

const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const LIMIT = Math.max(20, Math.min(1000, Number(process.env.CRAWL_LIMIT || 300)));
const CONCURRENCY = Math.max(2, Math.min(20, Number(process.env.CRAWL_CONCURRENCY || 8)));
const TIMEOUT = Math.max(3000, Number(process.env.CRAWL_TIMEOUT_MS || 12000));
const failures = [];
const warnings = [];
const visited = new Set();
const queue = [`${ORIGIN}/`, `${ORIGIN}/sitemap.xml`, `${ORIGIN}/news-sitemap.xml`, `${ORIGIN}/robots.txt`];

function sameSite(raw) {
  try { return new URL(raw, ORIGIN).origin === ORIGIN; } catch { return false; }
}
function normalize(raw) {
  try {
    const url = new URL(raw, ORIGIN);
    if (url.origin !== ORIGIN) return '';
    url.hash = '';
    return url.href;
  } catch { return ''; }
}
async function request(url, method = 'GET') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, { method, redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'TRRB-SEO-Audit/1.0' } });
  } finally { clearTimeout(timer); }
}
function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<(?:a|link|script|img|source)\b[^>]*(?:href|src)=["']([^"'#]+)["']/gi;
  let match;
  while ((match = re.exec(html))) {
    const value = match[1].trim();
    if (/^(?:mailto:|tel:|javascript:|data:)/i.test(value)) continue;
    const absolute = normalize(new URL(value, baseUrl).href);
    if (absolute) links.push(absolute);
  }
  return links;
}
function has(html, pattern) { return pattern.test(html); }
async function inspect(url) {
  let response;
  try { response = await request(url); }
  catch (error) { failures.push({ url, issue: `请求失败: ${error.name || error.message}` }); return; }
  const type = response.headers.get('content-type') || '';
  const status = response.status;
  if (status >= 400) {
    failures.push({ url, issue: `HTTP ${status}` });
    return;
  }
  if (response.url && new URL(response.url).hostname !== 'trrb.net') {
    failures.push({ url, issue: `最终主机错误: ${response.url}` });
  }
  if (!type.includes('text/html')) return;
  const html = await response.text();
  const is404 = /<title>[^<]*(?:404|页面不存在)/i.test(html);
  if (is404 && status === 200) failures.push({ url, issue: '软404：返回200但页面内容是404' });
  if (!is404) {
    if (!has(html, /<title>\s*[^<]{3,}\s*<\/title>/i)) failures.push({ url, issue: '缺少有效title' });
    if (!has(html, /<meta\s+[^>]*name=["']description["'][^>]*content=["'][^"']{20,}/i) && !has(html, /<meta\s+[^>]*content=["'][^"']{20,}["'][^>]*name=["']description["']/i)) warnings.push({ url, issue: '静态HTML缺少充分description，依赖JS生成' });
    if (!has(html, /<link\s+[^>]*rel=["']canonical["']/i) && !/article\.html|listing\.html/.test(new URL(url).pathname)) warnings.push({ url, issue: '静态HTML缺少canonical' });
    if (!has(html, /<meta\s+[^>]*property=["']og:title["']/i) && !/article\.html|listing\.html/.test(new URL(url).pathname)) warnings.push({ url, issue: '静态HTML缺少Open Graph' });
  }
  for (const link of extractLinks(html, response.url)) {
    if (sameSite(link) && !visited.has(link) && queue.length + visited.size < LIMIT * 3) queue.push(link);
  }
}

async function worker() {
  while (visited.size < LIMIT) {
    const url = queue.shift();
    if (!url) return;
    if (visited.has(url)) continue;
    visited.add(url);
    await inspect(url);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const report = {
  generated_at: new Date().toISOString(),
  origin: ORIGIN,
  checked: visited.size,
  failures,
  warnings: warnings.slice(0, 500)
};
fs.writeFileSync('live-seo-crawl-report.json', JSON.stringify(report, null, 2));
console.log(`线上抓取完成：${visited.size} 个URL，错误 ${failures.length}，警告 ${warnings.length}`);
if (failures.length) {
  console.error(failures.slice(0, 100).map((item) => `${item.url} — ${item.issue}`).join('\n'));
  process.exit(1);
}
