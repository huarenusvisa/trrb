#!/usr/bin/env node
import fs from 'node:fs';

const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const TIMEOUT = Math.max(5000, Number(process.env.CRAWL_TIMEOUT_MS || 15000));
const TARGET = `${ORIGIN}/us-crime/%E7%99%BE%E4%B8%87%E5%B7%A5%E5%85%B7%E7%9B%97%E7%AA%83%E6%A1%88%E5%91%8A%E7%A0%B4%E5%8D%8E%E7%94%B7%E7%82%AE%E5%88%B6%E5%B9%BD%E7%81%B5%E8%AE%A2%E5%8D%95%E7%9B%97%E8%B5%B0140%E4%B8%87%E7%BE%8E%E5%85%83%E8%8E%B7%E5%88%915%E5%B9%B4-msrgiw56-5a39d3`;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const failures = [];
const nodes = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), { status: 'running', checks: [] }]));

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, {
      ...options,
      headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', 'cache-control': 'no-cache', ...(options.headers || {}) },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function record(node, ok, label, detail = '') {
  nodes[String(node)].checks.push({ ok, label, detail });
  if (!ok) failures.push({ node, label, detail });
}
function canonical(html) {
  return String(html || '').match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]
    || String(html || '').match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1]
    || '';
}
function count(html, re) { return [...String(html || '').matchAll(re)].length; }
function links(html) {
  return [...String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]);
}
function locs(xml) {
  return [...String(xml || '').matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim().replaceAll('&amp;', '&'));
}
function missingState(html) { return /文章不存在|文章已下线|链接可能已经失效/i.test(String(html || '')); }

async function page(pathOrUrl, node) {
  const url = /^https?:/i.test(pathOrUrl) ? pathOrUrl : `${ORIGIN}${pathOrUrl}`;
  try {
    const r = await request(url, { redirect: 'follow' });
    const html = await r.text();
    record(node, r.status === 200, `${pathOrUrl} HTTP 200`, `status=${r.status}; final=${r.url}`);
    record(node, new URL(r.url).hostname === 'trrb.net', `${pathOrUrl} 主域`, r.url);
    const c = canonical(html);
    if (c) record(node, c.startsWith(`${ORIGIN}/`) && !c.includes('www.trrb.net'), `${pathOrUrl} canonical主域`, c);
    return { r, html };
  } catch (error) {
    record(node, false, `${pathOrUrl} 请求`, error.message || String(error));
    return { r: null, html: '' };
  }
}

async function asset(path, node) {
  try {
    const r = await request(`${ORIGIN}${path}`);
    const cache = r.headers.get('cache-control') || '';
    const type = r.headers.get('content-type') || '';
    const maxAge = Number(cache.match(/max-age=(\d+)/i)?.[1] || 0);
    record(node, r.status === 200, `${path} 可访问`, `status=${r.status}`);
    record(node, /text\/css|javascript/i.test(type), `${path} MIME正确`, type);
    record(node, maxAge >= 600, `${path} 缓存>=600秒`, cache);
  } catch (error) {
    record(node, false, `${path} 静态资源`, error.message || String(error));
  }
}

// 1. 首页性能优化
const home = await page('/', 1);
record(1, !/articles-chunk-\d+\.js/i.test(home.html), '首页不加载正文chunk');
record(1, count(home.html, /<script\b[^>]*src=/gi) <= 24, '首页脚本请求预算', `scripts=${count(home.html, /<script\b[^>]*src=/gi)}`);
await asset('/styles.css', 1);
await asset('/site-common.js', 1);

// 2. 文章页性能优化
const article = await page(TARGET, 2);
record(2, !missingState(article.html), '目标文章不出现不存在状态');
record(2, /data-prerendered=["']true["']/i.test(article.html), '目标文章服务端预渲染');
record(2, count(article.html, /<link\b[^>]*rel=["']stylesheet["']/gi) <= 5, '文章CSS请求预算', `stylesheets=${count(article.html, /<link\b[^>]*rel=["']stylesheet["']/gi)}`);
await asset('/article-v31.css', 2);
await asset('/article-route-runtime.js', 2);

// 3. 栏目页性能优化
for (const path of ['/important-news','/hot-headlines','/us-politics','/us-crime','/china-officialdom','/asylum','/immigrate/']) {
  const p = await page(path, 3);
  record(3, !missingState(p.html), `${path} 页面有效`);
}

// 4. Trump / ICE专题性能优化
for (const path of ['/trump','/ice','/ice/news']) {
  const p = await page(path, 4);
  record(4, count(p.html, /<script\b[^>]*src=/gi) <= 30, `${path} 脚本预算`, `scripts=${count(p.html, /<script\b[^>]*src=/gi)}`);
}

// 5. 全站内部链接新URL化 + 实际文章存活
let articleSitemap = '';
try {
  const r = await request(`${ORIGIN}/sitemap-articles-1.xml`);
  articleSitemap = await r.text();
  record(5, r.status === 200, '文章Sitemap HTTP 200', `status=${r.status}`);
  record(5, !/article\.html\?id=/i.test(articleSitemap), '文章Sitemap无旧参数URL');
} catch (error) { record(5, false, '文章Sitemap请求', error.message || String(error)); }
record(5, /article-route-runtime\.js/i.test(home.html), '首页启用canonical文章链接升级器');
const candidateUrls = [...new Set([
  ...links(home.html),
  ...locs(articleSitemap).slice(0, 8)
].map((href) => {
  try { return new URL(href, ORIGIN).toString(); } catch { return ''; }
}).filter((url) => url.startsWith(`${ORIGIN}/`) && /^https:\/\/trrb\.net\/[^/]+\/.+/.test(url) && !/\.(?:css|js|xml|json|webp|png|jpg|jpeg|svg)(?:\?|$)/i.test(url)))].slice(0, 10);
record(5, candidateUrls.length >= 3, '取得文章存活样本', `samples=${candidateUrls.length}`);
for (const url of candidateUrls) {
  try {
    const r = await request(url, { redirect: 'follow' });
    const html = await r.text();
    record(5, r.status === 200 && !missingState(html) && /<h1\b/i.test(html), '文章链接存活', `${r.status} ${r.url}`);
  } catch (error) { record(5, false, '文章链接存活', `${url}: ${error.message || error}`); }
}

// 6. 全站旧URL与重复URL收口
try {
  const httpsWww = await request('https://www.trrb.net/', { redirect: 'manual' });
  const loc = httpsWww.headers.get('location') || '';
  record(6, httpsWww.status === 301 && loc === `${ORIGIN}/`, 'https://www 一跳到主域', `${httpsWww.status} ${loc}`);
} catch (error) { record(6, false, 'https://www 主域重定向', error.message || String(error)); }
try {
  const first = await request('http://www.trrb.net/', { redirect: 'manual' });
  const loc1 = first.headers.get('location') || '';
  let ok = first.status === 301 && loc1 === `${ORIGIN}/`;
  let detail = `${first.status} ${loc1}`;
  if (!ok && first.status === 301 && loc1 === 'https://www.trrb.net/') {
    const second = await request(loc1, { redirect: 'manual' });
    const loc2 = second.headers.get('location') || '';
    ok = second.status === 301 && loc2 === `${ORIGIN}/`;
    detail += ` -> ${second.status} ${loc2}`;
  }
  record(6, ok, 'http://www 最多两跳且不产生重复内容', detail);
} catch (error) { record(6, false, 'http://www 主域重定向', error.message || String(error)); }
try {
  const r = await request(`${ORIGIN}/article.html?id=937a3291-2a24-4cc0-a504-5d234df73760`, { redirect: 'manual' });
  const loc = r.headers.get('location') || '';
  record(6, r.status === 301 && /^https:\/\/trrb\.net\/[^/]+\/.+/.test(loc), '旧文章URL 301到pretty URL', `${r.status} ${loc}`);
} catch (error) { record(6, false, '旧文章URL重定向', error.message || String(error)); }

// 7. Sitemap / News Sitemap / RSS深度验收
for (const path of ['/sitemap.xml','/news-sitemap.xml','/feed.xml']) {
  try {
    const r = await request(`${ORIGIN}${path}`);
    const text = await r.text();
    record(7, r.status === 200, `${path} HTTP 200`, `status=${r.status}`);
    record(7, !text.includes('www.trrb.net'), `${path} 无www主域`);
    record(7, !text.includes('article.html?id='), `${path} 无旧文章URL`);
  } catch (error) { record(7, false, `${path} 请求`, error.message || String(error)); }
}

// 8. 全站结构化数据验收
record(8, /["']@type["']\s*:\s*["']NewsArticle["']/i.test(article.html), 'NewsArticle结构化数据');
record(8, /NewsMediaOrganization|Organization/i.test(article.html), 'Publisher/Organization结构化数据');
record(8, /BreadcrumbList/i.test(article.html), 'BreadcrumbList结构化数据');
record(8, /property=["']og:title["']/i.test(article.html) && /name=["']twitter:card["']/i.test(article.html), 'OG + Twitter元数据');

// 9. Google/Bing搜索引擎抓取准备
try {
  const r = await request(`${ORIGIN}/robots.txt`);
  const text = await r.text();
  record(9, r.status === 200, 'robots.txt HTTP 200', `status=${r.status}`);
  record(9, /sitemap:\s*https:\/\/trrb\.net\/sitemap\.xml/i.test(text), 'robots声明主Sitemap');
  record(9, !/disallow:\s*\/$/im.test(text), 'robots未全站禁止抓取');
} catch (error) { record(9, false, 'robots.txt抓取', error.message || String(error)); }

for (let i = 1; i <= 9; i += 1) {
  const n = nodes[String(i)];
  n.status = n.checks.some((c) => c.ok === false) ? 'failed' : 'pass';
}
nodes['10'].status = failures.length ? 'blocked' : 'pass';
nodes['10'].checks.push({ ok: failures.length === 0, label: '第十一轮1-9节点最终汇总', detail: `failures=${failures.length}` });

const report = { generated_at: new Date().toISOString(), origin: ORIGIN, failures, nodes };
fs.writeFileSync('round11-final-production-audit.json', JSON.stringify(report, null, 2));
console.log(`Round 11 FINAL audit: failures=${failures.length}`);
for (let i = 1; i <= 10; i += 1) console.log(`node ${i}: ${nodes[String(i)].status}`);
if (failures.length) {
  failures.forEach((x) => console.error(`node ${x.node}: ${x.label} — ${x.detail}`));
  process.exit(1);
}
console.log('ROUND 11: 10/10 PASS');
