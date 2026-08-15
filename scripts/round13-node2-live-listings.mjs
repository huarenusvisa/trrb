#!/usr/bin/env node
import fs from 'node:fs';
import { chromium } from 'playwright';

const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const DB_HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' };
const TIMEOUT = 20000;
const failures = [];
const checks = [];

function clean(v='') { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
function record(ok, label, detail='') {
  checks.push({ ok, label, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push({ label, detail });
}
function normalizeUrl(value) {
  try {
    const u = new URL(value, ORIGIN);
    u.hash = '';
    u.search = '';
    return u.toString().replace(/\/$/, '');
  } catch { return ''; }
}

async function db(table, params) {
  const u = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, String(v)));
  const r = await fetch(u, { headers: DB_HEADERS });
  if (!r.ok) throw new Error(`${table} ${r.status}: ${(await r.text()).slice(0,180)}`);
  return r.json();
}

const categories = await db('categories', {
  select: 'id,name,slug,is_active',
  is_active: 'eq.true',
  limit: '500'
});
const articles = await db('articles', {
  select: 'id,title,slug,category_id,category_name,topic_key,status,published_at,created_at',
  status: 'eq.published',
  order: 'published_at.desc.nullslast,created_at.desc',
  limit: '240'
});

const byId = new Map(categories.map(x => [String(x.id || ''), x]));
const byName = new Map(categories.map(x => [clean(x.name), x]));
const fallback = new Map([
  ['重要新闻','important-news'],['热门头条','hot-headlines'],['美国时政','us-politics'],['美国警情','us-crime'],
  ['中国官场','china-officialdom'],['移民美国','immigration'],['庇护百科','asylum'],['驱逐快报','deport'],
  ['ICE执法动态','ice'],['ICE执法','ice'],['曝光墙','expose']
]);
function sectionFor(a) {
  const topic = clean(a.topic_key).toLowerCase();
  if (topic === 'trump') return 'trump';
  if (topic === 'ice') return 'ice';
  const c1 = byId.get(String(a.category_id || ''));
  if (clean(c1?.slug)) return clean(c1.slug);
  const c2 = byName.get(clean(a.category_name));
  if (clean(c2?.slug)) return clean(c2.slug);
  return fallback.get(clean(a.category_name)) || 'news';
}
function canonicalFor(a) {
  return `${ORIGIN}/${encodeURIComponent(sectionFor(a))}/${encodeURIComponent(clean(a.slug || a.id))}`;
}
function latestWhere(predicate, limit=12) { return articles.filter(predicate).slice(0, limit); }

const targets = [
  { name: '首页', path: '/', expected: articles.slice(0, 30) },
  { name: '重要新闻栏目', path: '/important-news', expected: latestWhere(a => clean(a.category_name) === '重要新闻', 16) },
  { name: '热门头条栏目', path: '/hot-headlines', expected: latestWhere(a => clean(a.category_name) === '热门头条', 16) },
  { name: '美国时政栏目', path: '/us-politics', expected: latestWhere(a => clean(a.category_name) === '美国时政', 16) },
  { name: '美国警情栏目', path: '/us-crime', expected: latestWhere(a => clean(a.category_name) === '美国警情', 16) },
  { name: '中国官场栏目', path: '/china-officialdom', expected: latestWhere(a => clean(a.category_name) === '中国官场', 16) },
  { name: '庇护百科栏目', path: '/asylum', expected: latestWhere(a => clean(a.category_name) === '庇护百科', 16) },
  { name: 'Trump专题', path: '/trump', expected: latestWhere(a => clean(a.topic_key).toLowerCase() === 'trump', 20) },
  { name: 'ICE专题', path: '/ice', expected: latestWhere(a => clean(a.topic_key).toLowerCase() === 'ice' || /ICE执法/i.test(clean(a.category_name)), 20) },
  { name: 'ICE新闻列表', path: '/ice/news', expected: latestWhere(a => clean(a.topic_key).toLowerCase() === 'ice' || /ICE执法/i.test(clean(a.category_name)), 20) }
].filter(t => t.expected.length > 0);

record(targets.length >= 8, '取得首页/栏目/专题生产验收目标', `targets=${targets.length}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, locale: 'zh-CN' });

async function verifyClickedArticle(sourcePage, locator, chosen, targetName) {
  const chosenNorm = normalizeUrl(chosen.url);
  let popup = null;
  const popupPromise = sourcePage.waitForEvent('popup', { timeout: 2500 }).catch(() => null);
  const sameTabPromise = sourcePage.waitForURL((u) => normalizeUrl(u.toString()) === chosenNorm, { timeout: TIMEOUT }).then(() => sourcePage).catch(() => null);
  await locator.click({ timeout: TIMEOUT });
  popup = await popupPromise;
  let destination = popup || await sameTabPromise;
  if (!destination) {
    if (normalizeUrl(sourcePage.url()) === chosenNorm) destination = sourcePage;
    else throw new Error(`click did not reach expected article: ${chosenNorm}`);
  }
  await destination.waitForLoadState('domcontentloaded', { timeout: TIMEOUT }).catch(() => {});
  const h1 = clean(await destination.locator('h1').first().textContent().catch(() => ''));
  const canonical = normalizeUrl(await destination.locator('link[rel="canonical"]').first().getAttribute('href').catch(() => ''));
  record(normalizeUrl(destination.url()) === chosenNorm, `${targetName}点击后URL与所点文章一致`, destination.url());
  record(h1.includes(chosen.title.slice(0, Math.min(12, chosen.title.length))), `${targetName}点击后H1与所点标题一致`, `h1=${h1.slice(0,60)}`);
  record(canonical === chosenNorm, `${targetName}点击后canonical一致`, canonical);
  if (popup) await popup.close().catch(() => {});
}

for (const target of targets) {
  const page = await context.newPage();
  const url = `${ORIGIN}${target.path}`;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    record(response?.status() === 200, `${target.name} HTTP 200`, `status=${response?.status() || 0}`);
    await page.waitForTimeout(3500);

    const anchors = await page.locator('a[href]').evaluateAll((els) => els.map((a, index) => ({
      index,
      href: a.href,
      text: (a.textContent || '').replace(/\s+/g, ' ').trim()
    })).filter(x => x.href && x.text));
    const anchorMap = new Map(anchors.map(x => [x.href.replace(/\/$/, '').split('#')[0].split('?')[0], x]));
    const expected = target.expected.map(a => ({ article: a, url: canonicalFor(a), title: clean(a.title) }));
    const matches = expected.filter(x => anchorMap.has(normalizeUrl(x.url)));
    record(matches.length > 0, `${target.name}包含数据库近期文章`, `matched=${matches.length}/${expected.length}; anchors=${anchors.length}`);

    const legacy = anchors.filter(x => /\/article\.html\?id=/i.test(x.href));
    record(legacy.length === 0, `${target.name}文章链接直接使用pretty URL`, `legacy=${legacy.length}`);

    if (matches.length) {
      const chosen = matches[0];
      const chosenNorm = normalizeUrl(chosen.url);
      const anchorIndex = anchors.find(x => normalizeUrl(x.href) === chosenNorm)?.index;
      if (Number.isInteger(anchorIndex)) {
        const locator = page.locator('a[href]').nth(anchorIndex);
        await verifyClickedArticle(page, locator, chosen, target.name);
      } else {
        record(false, `${target.name}定位匹配文章锚点`, chosen.url);
      }
    }
  } catch (error) {
    record(false, `${target.name}浏览器验收`, error.message || String(error));
  } finally {
    await page.close();
  }
}

await browser.close();

const report = {
  generated_at: new Date().toISOString(),
  origin: ORIGIN,
  target_count: targets.length,
  failures,
  checks
};
fs.writeFileSync('round13-node2-live-listings.json', JSON.stringify(report, null, 2));
console.log(`ROUND13 NODE2 audit: checks=${checks.length}; failures=${failures.length}`);
if (failures.length) {
  failures.forEach(x => console.error(`FAIL ${x.label} — ${x.detail}`));
  process.exit(1);
}
console.log('ROUND13 NODE2 PASS: homepage / category / topic realtime sync and click consistency verified');
