import { writeFileSync } from 'node:fs';

const ORIGIN = (process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/$/, '');
const checks = [];
let failures = 0;

function check(ok, label, detail = '') {
  checks.push({ ok: Boolean(ok), label, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function request(urlOrPath, { redirect = 'follow', ua = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } = {}) {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `${ORIGIN}${urlOrPath}`;
  const res = await fetch(url, { redirect, headers: { 'user-agent': ua, 'cache-control': 'no-cache', pragma: 'no-cache' } });
  return { status: res.status, url: res.url, headers: Object.fromEntries(res.headers.entries()), text: await res.text() };
}

function canonical(html) {
  return (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
          html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i) || [])[1] || '';
}

function robotsMeta(html) {
  return (html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i) || [])[1] || '';
}

function noindex(r) {
  return /noindex/i.test(robotsMeta(r.text)) || /noindex/i.test(r.headers['x-robots-tag'] || '');
}

function locs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
}

const robots = await request('/robots.txt');
check(robots.status === 200, 'robots.txt HTTP 200', `status=${robots.status}`);
check(/Disallow:\s*\/admin\//i.test(robots.text), 'robots.txt 屏蔽后台');
check(/Disallow:\s*\/trrb_admin_v1\//i.test(robots.text), 'robots.txt 屏蔽旧后台');
check(/Disallow:\s*\/\.netlify\//i.test(robots.text), 'robots.txt 屏蔽 Netlify 内部路径');
check(/Disallow:\s*\/\*\?q=/i.test(robots.text), 'robots.txt 屏蔽站内搜索参数抓取');
check(/Disallow:\s*\/\*\?preview=/i.test(robots.text), 'robots.txt 屏蔽预览参数抓取');
check(!/Disallow:\s*\/$/mi.test(robots.text), 'robots.txt 未误封整站');

const sitemap = await request('/sitemap.xml?r14=node2');
check(sitemap.status === 200, '生产 Sitemap HTTP 200', `status=${sitemap.status}`);
const urls = locs(sitemap.text).filter(u => u.startsWith(`${ORIGIN}/`));
check(urls.length >= 100, '生产 Sitemap 有足量可索引URL', `urls=${urls.length}`);
check(!urls.some(u => /[?&](q|preview)=/i.test(u)), 'Sitemap 不包含搜索/预览参数URL');
check(!urls.some(u => /article\.html\?id=/i.test(u)), 'Sitemap 不包含 legacy article?id URL');
check(!urls.some(u => /^https:\/\/www\.trrb\.net/i.test(u)), 'Sitemap 不包含 www 重复主域');

const articleUrls = urls.filter(u => /^https:\/\/trrb\.net\/[^/?#]+\/[^/?#]+/i.test(u)).slice(-20);
check(articleUrls.length >= 12, '取得20篇以内生产文章样本', `sample=${articleUrls.length}`);
let canonicalBad = 0;
let noindexBad = 0;
let multiCanonical = 0;
for (const url of articleUrls) {
  const r = await request(`${url}${url.includes('?') ? '&' : '?'}r14n2=1`);
  const c = canonical(r.text).replace(/\/$/, '');
  const expected = url.replace(/\/$/, '');
  const count = (r.text.match(/<link[^>]+rel=["']canonical["']/gi) || []).length +
    (r.text.match(/<link[^>]+href=["'][^"']+["'][^>]+rel=["']canonical["']/gi) || []).length;
  if (r.status !== 200 || c !== expected) canonicalBad++;
  if (noindex(r)) noindexBad++;
  if (count !== 1) multiCanonical++;
}
check(canonicalBad === 0, '文章 canonical 与最终URL一对一一致', `checked=${articleUrls.length}; bad=${canonicalBad}`);
check(noindexBad === 0, '生产文章无意外 noindex', `checked=${articleUrls.length}; bad=${noindexBad}`);
check(multiCanonical === 0, '生产文章每页仅一个 canonical', `checked=${articleUrls.length}; bad=${multiCanonical}`);

for (const path of ['/', '/important-news', '/hot-headlines', '/us-politics', '/us-crime', '/trump', '/ice']) {
  const r = await request(`${path}?r14n2=entry`);
  check(r.status === 200 && !noindex(r), `${path} 公共入口保持 indexable`, `status=${r.status}`);
}

const searchPage = await request('/listing.html?type=search&q=ICE');
check(searchPage.status === 200, '搜索页可访问', `status=${searchPage.status}`);
check(noindex(searchPage), '站内搜索结果页明确 noindex');

const preview = await request('/article.html?preview=1');
check(preview.status === 200 || preview.status === 404, '预览入口不会返回5xx', `status=${preview.status}`);
if (preview.status === 200) check(noindex(preview), '预览入口明确 noindex');

const legacyTarget = articleUrls[0];
if (legacyTarget) {
  const slug = legacyTarget.split('/').pop();
  const legacy = await request(`/article.html?id=${encodeURIComponent(slug)}`, { redirect: 'manual' });
  check([301,302,307,308,404].includes(legacy.status), 'legacy article?id 不作为200可索引重复页', `status=${legacy.status}`);
}

writeFileSync('round14-node2-canonical-robots-noindex-audit.json', JSON.stringify({ generatedAt: new Date().toISOString(), origin: ORIGIN, checks, failures }, null, 2));
console.log(`ROUND14 NODE2 audit: checks=${checks.length}; failures=${failures}`);
if (failures === 0) console.log('ROUND14 NODE2 PASS: Canonical / Robots / Noindex deep governance verified');
else { console.log('ROUND14 NODE2 FAIL: Canonical / Robots / Noindex issues detected'); process.exitCode = 1; }
