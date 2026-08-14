#!/usr/bin/env node

const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const DB_HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' };
const FALLBACK = new Map([
  ['重要新闻','important-news'],['热门头条','hot-headlines'],['美国时政','us-politics'],['美国警情','us-crime'],
  ['中国官场','china-officialdom'],['移民美国','immigration'],['庇护百科','asylum'],['驱逐快报','deport'],
  ['ICE执法动态','ice'],['ICE执法','ice'],['曝光墙','expose']
]);

function fail(message) {
  console.error(`ROUND13 NODE1 FAIL: ${message}`);
  process.exitCode = 1;
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, {
      redirect: 'follow',
      ...options,
      headers: { 'user-agent': 'TRRB-Round13-Freshness/1.0', 'cache-control': 'no-cache', ...(options.headers || {}) },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function db(path, params) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await request(url, { headers: DB_HEADERS });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${(await r.text()).slice(0,200)}`);
  return r.json();
}

function sectionFor(article, byId, byName) {
  const topic = String(article.topic_key || '').trim().toLowerCase();
  if (topic === 'trump') return 'trump';
  if (topic === 'ice') return 'ice';
  const byCategoryId = byId.get(String(article.category_id || ''));
  if (byCategoryId?.slug) return String(byCategoryId.slug).trim();
  const byCategoryName = byName.get(String(article.category_name || '').trim());
  if (byCategoryName?.slug) return String(byCategoryName.slug).trim();
  return FALLBACK.get(String(article.category_name || '').trim()) || 'news';
}

function canonicalFor(article, byId, byName) {
  return `${ORIGIN}/${encodeURIComponent(sectionFor(article, byId, byName))}/${encodeURIComponent(String(article.slug || article.id || '').trim())}`;
}

function containsMissingMessage(html) {
  return /文章不存在|文章已下线|链接可能已经失效|该文章已删除/i.test(String(html || ''));
}

const categories = await db('categories', {
  select: 'id,name,slug',
  is_active: 'eq.true',
  limit: '500'
});
const articles = await db('articles', {
  select: 'id,title,slug,category_id,category_name,topic_key,status,published_at,created_at',
  status: 'eq.published',
  order: 'published_at.desc.nullslast,created_at.desc',
  limit: '20'
});

if (!Array.isArray(articles) || articles.length < 10) {
  fail(`latest published sample too small: ${Array.isArray(articles) ? articles.length : 0}`);
  process.exit();
}

const byId = new Map(categories.map(x => [String(x.id || ''), x]));
const byName = new Map(categories.map(x => [String(x.name || '').trim(), x]));
const latest = articles[0];
const latestUrl = canonicalFor(latest, byId, byName);
console.log(`Latest DB article: ${latest.id} | ${latest.title}`);
console.log(`Latest canonical: ${latestUrl}`);

// Gate A: newest articles must immediately resolve to their own server-rendered article.
let articleFailures = 0;
for (const article of articles.slice(0, 12)) {
  const url = canonicalFor(article, byId, byName);
  try {
    const r = await request(url);
    const html = await r.text();
    const titlePrefix = String(article.title || '').slice(0, Math.min(10, String(article.title || '').length));
    const ok = r.status === 200 && !containsMissingMessage(html) && html.includes(titlePrefix) && /data-prerendered=["']true["']/i.test(html);
    console.log(`${ok ? 'PASS' : 'FAIL'} article ${r.status}: ${url}`);
    if (!ok) articleFailures += 1;
  } catch (e) {
    console.log(`FAIL article request: ${url} ${e.message || e}`);
    articleFailures += 1;
  }
}
if (articleFailures) fail(`latest article canonical failures=${articleFailures}`);

// Gate B: latest published canonical must have converged into the main sitemap.
try {
  const r = await request(`${ORIGIN}/sitemap.xml`);
  const xml = await r.text();
  const ok = r.status === 200 && xml.includes(latestUrl.replaceAll('&','&amp;'));
  console.log(`${ok ? 'PASS' : 'FAIL'} sitemap latest article: status=${r.status}`);
  if (!ok) fail('latest published article missing from sitemap.xml');
} catch (e) {
  fail(`sitemap request failed: ${e.message || e}`);
}

// Gate C: news sitemap and RSS must be healthy and contain recent published content.
for (const [path, label] of [['/news-sitemap.xml','news sitemap'], ['/feed.xml','RSS feed']]) {
  try {
    const r = await request(`${ORIGIN}${path}`);
    const text = await r.text();
    const recentHit = articles.slice(0, 20).some(a => {
      const u = canonicalFor(a, byId, byName);
      return text.includes(u.replaceAll('&','&amp;')) || text.includes(u);
    });
    const ok = r.status === 200 && recentHit;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: status=${r.status}; recentHit=${recentHit}`);
    if (!ok) fail(`${label} has no recent published article`);
  } catch (e) {
    fail(`${label} request failed: ${e.message || e}`);
  }
}

if (!process.exitCode) {
  console.log('ROUND13 NODE1 PASS: latest article publish chain is live and converged');
}
