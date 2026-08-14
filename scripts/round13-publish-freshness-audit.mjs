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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, {
      redirect: 'follow',
      ...options,
      headers: { 'user-agent': 'TRRB-Round13-Freshness/1.1', 'cache-control': 'no-cache', pragma: 'no-cache', ...(options.headers || {}) },
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

async function waitForEntry(path, label, candidates, attempts = 18, delayMs = 10000) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const separator = path.includes('?') ? '&' : '?';
      const r = await request(`${ORIGIN}${path}${separator}round13=${Date.now()}-${attempt}`);
      const text = await r.text();
      lastStatus = r.status;
      const hit = candidates.some(value => text.includes(value.replaceAll('&','&amp;')) || text.includes(value));
      if (r.status === 200 && hit) {
        console.log(`PASS ${label}: status=${r.status}; attempt=${attempt}`);
        return true;
      }
      console.log(`WAIT ${label}: status=${r.status}; attempt=${attempt}/${attempts}; hit=${hit}`);
    } catch (e) {
      console.log(`WAIT ${label}: attempt=${attempt}/${attempts}; ${e.message || e}`);
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  console.log(`FAIL ${label}: lastStatus=${lastStatus}`);
  return false;
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
    const r = await request(`${url}?round13=${Date.now()}`);
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

// Gate B: the newest published canonical must converge into the deployed main sitemap.
const sitemapOk = await waitForEntry('/sitemap.xml', 'sitemap latest article', [latestUrl]);
if (!sitemapOk) fail('latest published article missing from sitemap.xml after convergence window');

// Gate C: News Sitemap and RSS must converge too. Accept any of the latest 20 articles.
const recentUrls = articles.slice(0, 20).map(a => canonicalFor(a, byId, byName));
for (const [path, label] of [['/news-sitemap.xml','news sitemap'], ['/feed.xml','RSS feed']]) {
  const ok = await waitForEntry(path, label, recentUrls, 6, 5000);
  if (!ok) fail(`${label} has no recent published article after convergence window`);
}

if (!process.exitCode) {
  console.log('ROUND13 NODE1 PASS: latest article publish chain is live and converged');
}
