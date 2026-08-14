#!/usr/bin/env node
import fs from 'node:fs';

const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const TIMEOUT = Math.max(5000, Number(process.env.CRAWL_TIMEOUT_MS || 15000));
const failures = [];
const warnings = [];
const nodes = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), { status: 'running', checks: [] }]));

const headers = {
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
  'cache-control': 'no-cache'
};

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function record(node, ok, label, detail = '') {
  nodes[String(node)].checks.push({ ok, label, detail });
  if (!ok) failures.push({ node, label, detail });
}
function warn(node, label, detail = '') {
  warnings.push({ node, label, detail });
  nodes[String(node)].checks.push({ ok: true, warning: true, label, detail });
}
function locs(xml) {
  return [...String(xml || '').matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim().replaceAll('&amp;', '&'));
}
function canonical(html) {
  return String(html || '').match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]
    || String(html || '').match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1]
    || '';
}
function count(html, re) { return [...String(html || '').matchAll(re)].length; }

async function htmlPage(path, node) {
  const url = `${ORIGIN}${path}`;
  try {
    const r = await request(url, { redirect: 'follow' });
    const text = await r.text();
    record(node, r.status === 200, `${path} HTTP 200`, `status=${r.status}`);
    record(node, new URL(r.url).hostname === 'trrb.net', `${path} 主域`, r.url);
    const c = canonical(text);
    if (c) record(node, c.startsWith(`${ORIGIN}/`) && !c.includes('www.trrb.net'), `${path} canonical主域`, c);
    return { url, r, text };
  } catch (error) {
    record(node, false, `${path} 请求`, error.message || String(error));
    return { url, r: null, text: '' };
  }
}

// Node 1: homepage payload/performance gate (dedicated verifier performs the strict budget).
const home = await htmlPage('/', 1);
record(1, !/articles-chunk-\d+\.js/i.test(home.text), '首页不再加载正文chunk');
record(1, /article-route-runtime\.js/i.test(home.text), '首页启用canonical文章链接升级器');
const homeScripts = count(home.text, /<script\b[^>]*src=/gi);
record(1, homeScripts <= 24, '首页脚本请求预算', `scripts=${homeScripts}`);

// Node 2: article route performance/SEO using first canonical article from article sitemap.
let articleUrl = '';
let articleSitemapText = '';
try {
  const sm = await request(`${ORIGIN}/sitemap-articles-1.xml`);
  articleSitemapText = await sm.text();
  articleUrl = locs(articleSitemapText).find((u) => u.startsWith(`${ORIGIN}/`) && !u.includes('/article.html')) || '';
  record(2, sm.status === 200 && Boolean(articleUrl), '文章Sitemap提供canonical样本', `status=${sm.status}; sample=${articleUrl}`);
} catch (error) {
  record(2, false, '读取文章Sitemap', error.message || String(error));
}
if (articleUrl) {
  try {
    const r = await request(articleUrl);
    const html = await r.text();
    record(2, r.status === 200, 'canonical文章HTTP 200', `status=${r.status}`);
    record(2, count(html, /<link\b[^>]*rel=["']stylesheet["']/gi) <= 5, '文章CSS请求预算', `stylesheets=${count(html, /<link\b[^>]*rel=["']stylesheet["']/gi)}`);
    record(8, /["']@type["']\s*:\s*["']NewsArticle["']/i.test(html), 'NewsArticle结构化数据');
    record(8, /NewsMediaOrganization|Organization/i.test(html), 'Publisher/Organization结构化数据');
    record(8, /property=["']og:title["']/i.test(html) && /name=["']twitter:card["']/i.test(html), 'OG + Twitter元数据');
    if (!/BreadcrumbList/i.test(html)) warn(8, 'BreadcrumbList待补强', articleUrl);
  } catch (error) {
    record(2, false, '抓取canonical文章', error.message || String(error));
  }
}

// Node 3: major listing/category routes.
for (const path of ['/important-news','/hot-headlines','/us-politics','/us-crime','/china-officialdom','/asylum','/immigrate/']) {
  const page = await htmlPage(path, 3);
  record(3, !/article\.html\?id=/i.test(page.text), `${path} 静态HTML无旧文章URL`);
}

// Node 4: Trump + ICE topic performance and route health.
for (const path of ['/trump','/ice','/ice/news']) {
  const page = await htmlPage(path, 4);
  const scripts = count(page.text, /<script\b[^>]*src=/gi);
  record(4, scripts <= 30, `${path} 脚本预算`, `scripts=${scripts}`);
}

// Node 5: internal-link canonicalization.
record(5, /article-route-runtime\.js/i.test(home.text), '首页动态文章链接canonical升级已启用');
record(5, !/article\.html\?id=/i.test(articleSitemapText), '文章Sitemap不包含旧参数URL');

// Node 6: host/legacy duplicate retirement.
for (const source of ['http://www.trrb.net/','https://www.trrb.net/']) {
  try {
    const r = await request(source, { redirect: 'manual' });
    const location = r.headers.get('location') || '';
    record(6, r.status === 301 && location.startsWith(`${ORIGIN}/`), `${source} 一跳301到主域`, `${r.status} ${location}`);
  } catch (error) { record(6, false, `${source} 主域重定向`, error.message || String(error)); }
}
const legacyId = '937a3291-2a24-4cc0-a504-5d234df73760';
try {
  const r = await request(`${ORIGIN}/article.html?id=${legacyId}`, { redirect: 'manual' });
  const location = r.headers.get('location') || '';
  record(6, r.status === 301 && /^https:\/\/trrb\.net\/[^/]+\/.+/.test(location), '旧文章URL 301到pretty URL', `${r.status} ${location}`);
} catch (error) { record(6, false, '旧文章URL重定向', error.message || String(error)); }

// Node 7: sitemap/news sitemap/RSS consistency.
for (const path of ['/sitemap.xml','/news-sitemap.xml','/feed.xml']) {
  try {
    const r = await request(`${ORIGIN}${path}`);
    const text = await r.text();
    record(7, r.status === 200, `${path} HTTP 200`, `status=${r.status}`);
    record(7, !text.includes('www.trrb.net'), `${path} 无www主域`);
    record(7, !text.includes('article.html?id='), `${path} 无旧文章URL`);
  } catch (error) { record(7, false, `${path} 请求`, error.message || String(error)); }
}

// Node 9: crawler readiness.
try {
  const r = await request(`${ORIGIN}/robots.txt`);
  const text = await r.text();
  record(9, r.status === 200, 'robots.txt HTTP 200', `status=${r.status}`);
  record(9, /sitemap:\s*https:\/\/trrb\.net\/sitemap\.xml/i.test(text), 'robots声明主Sitemap');
  record(9, !/disallow:\s*\/$/im.test(text), 'robots未全站禁止抓取');
} catch (error) { record(9, false, 'robots.txt抓取', error.message || String(error)); }

// Nodes 2-4 also validate reusable static assets are cacheable after deployment.
for (const asset of ['/styles.css','/article-v31.css','/site-common.js','/article-route-runtime.js']) {
  try {
    const r = await request(`${ORIGIN}${asset}`);
    const cache = r.headers.get('cache-control') || '';
    const type = r.headers.get('content-type') || '';
    const node = asset.includes('article') ? 2 : 1;
    record(node, r.status === 200, `${asset} 可访问`, `status=${r.status}`);
    record(node, /text\/css|javascript/i.test(type), `${asset} MIME正确`, type);
    if (!/max-age=(?:[1-9]\d{3,}|[6-9]\d{2})/i.test(cache)) warn(node, `${asset} 缓存策略仍可加强`, cache);
  } catch (error) { record(1, false, `${asset} 静态资源`, error.message || String(error)); }
}

for (let i = 1; i <= 9; i += 1) {
  const n = nodes[String(i)];
  n.status = n.checks.some((c) => c.ok === false) ? 'failed' : n.checks.some((c) => c.warning) ? 'warning' : 'pass';
}
nodes['10'].status = failures.length ? 'blocked' : 'ready-for-final-acceptance';
nodes['10'].checks.push({ ok: failures.length === 0, label: '1-9节点自动验收汇总', detail: `failures=${failures.length}; warnings=${warnings.length}` });

const report = {
  generated_at: new Date().toISOString(),
  origin: ORIGIN,
  article_sample: articleUrl,
  failures,
  warnings,
  nodes
};
fs.writeFileSync('round11-production-audit.json', JSON.stringify(report, null, 2));
console.log(`Round 11 parallel audit: failures=${failures.length}, warnings=${warnings.length}`);
for (let i = 1; i <= 10; i += 1) console.log(`node ${i}: ${nodes[String(i)].status}`);
if (failures.length) {
  console.error(failures.map((x) => `node ${x.node}: ${x.label} — ${x.detail}`).join('\n'));
  process.exit(1);
}
