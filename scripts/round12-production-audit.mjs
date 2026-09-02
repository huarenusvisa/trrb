#!/usr/bin/env node
import fs from 'node:fs';

const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const TIMEOUT = 15000;
const MIN_INDEXABLE_BODY_LENGTH = 300;
const MIN_INDEXABLE_TITLE_LENGTH = 8;
const MAX_SITEMAP_ARTICLES = 5000;
const ARTICLE_SECTIONS = new Set(['ice','trump','important-news','hot-headlines','us-politics','us-crime','china-officialdom','immigration','asylum','deport','news','expose']);
const FALLBACK = new Map([
  ['重要新闻','important-news'],['热门头条','hot-headlines'],['美国时政','us-politics'],['美国警情','us-crime'],
  ['中国官场','china-officialdom'],['移民美国','immigration'],['庇护百科','asylum'],['驱逐快报','deport'],
  ['ICE执法动态','ice'],['ICE执法','ice'],['曝光墙','expose']
]);

const nodes = Object.fromEntries(Array.from({length: 10}, (_, i) => [String(i + 1), {status:'pending', checks:[]} ]));
const failures = [];
const warnings = [];

function record(node, ok, label, detail = '', severity = 'error') {
  nodes[String(node)].checks.push({ok, label, detail, severity});
  if (!ok) (severity === 'warning' ? warnings : failures).push({node, label, detail});
}

async function req(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, {
      ...options,
      headers: {'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9', ...(options.headers || {})},
      signal: controller.signal
    });
  } finally { clearTimeout(timer); }
}

const DB_HEADERS = {apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept:'application/json'};

async function dbAll(table, select, extra = {}) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const u = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    u.searchParams.set('select', select);
    Object.entries(extra).forEach(([k,v]) => u.searchParams.set(k, v));
    u.searchParams.set('limit', '1000');
    u.searchParams.set('offset', String(offset));
    const r = await req(u, {headers: DB_HEADERS});
    if (!r.ok) throw new Error(`${table} ${r.status}: ${(await r.text()).slice(0,180)}`);
    const batch = await r.json();
    if (!Array.isArray(batch)) break;
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return out;
}

function sectionFor(a, byId, byName) {
  const topic = String(a.topic_key || '').trim().toLowerCase();
  if (topic === 'trump') return 'trump';
  if (topic === 'ice') return 'ice';
  const byCategoryId = byId.get(String(a.category_id || ''));
  if (byCategoryId?.slug) return String(byCategoryId.slug).trim();
  const byCategoryName = byName.get(String(a.category_name || '').trim());
  if (byCategoryName?.slug) return String(byCategoryName.slug).trim();
  return FALLBACK.get(String(a.category_name || '').trim()) || 'news';
}
function canonicalFor(a, byId, byName) {
  return `${ORIGIN}/${encodeURIComponent(sectionFor(a, byId, byName))}/${encodeURIComponent(String(a.slug || a.id || '').trim())}`;
}
function missing(html) { return /文章不存在|文章已下线|链接可能已经失效|该文章已删除/i.test(String(html || '')); }
function h1(html) { return String(html || '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g,'').trim() || ''; }
function stableSuffix(slug) {
  const s = String(slug || '');
  return s.match(/-([a-z0-9]{6,14}-[a-z0-9]{6,14})$/i)?.[1] || s.match(/-([a-z0-9]{6,14})$/i)?.[1] || '';
}
function visibleText(value='') {
  return String(value||'')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&[a-z0-9#]+;/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function normalizedTitle(value='') { return visibleText(value).toLowerCase().replace(/[\p{P}\p{S}\s]+/gu,''); }
function isIceArticle(a) {
  const topic=String(a?.topic_key||'').trim().toLowerCase();
  const category=String(a?.category_name||'').trim();
  return topic==='ice'||category==='ICE执法动态'||category==='ICE执法';
}
function isSpecialTopic(a) {
  const topic=String(a?.topic_key||'').trim().toLowerCase();
  return topic==='ice'||topic==='trump';
}
function timeOf(a) {
  const t=Date.parse(a?.published_at||a?.created_at||'');
  return Number.isFinite(t)?t:0;
}
function isArticleCanonicalUrl(value='') {
  try {
    const u=new URL(value,ORIGIN);
    if(u.hostname!=='trrb.net'&&u.hostname!=='www.trrb.net')return false;
    const parts=decodeURIComponent(u.pathname).split('/').filter(Boolean);
    return parts.length===2&&ARTICLE_SECTIONS.has(parts[0])&&!(parts[0]==='ice'&&parts[1]==='news');
  } catch { return false; }
}
async function pool(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({length: Math.min(limit, items.length)}, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}
function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((x) => { const k = keyFn(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

const categories = await dbAll('categories', 'id,name,slug,is_active,include_in_sitemap', {is_active:'eq.true'});
const articles = await dbAll('articles', 'id,title,slug,summary,content,category_id,category_name,topic_key,cover_image,status,published_at,created_at', {status:'eq.published', order:'published_at.desc.nullslast,created_at.desc,id.desc'});
const byId = new Map(categories.map(x => [String(x.id || ''), x]));
const byName = new Map(categories.map(x => [String(x.name || '').trim(), x]));
const canonicalMap = new Map(articles.map(a => [String(a.id), canonicalFor(a, byId, byName)]));
const allowedCategoryIds = new Set(categories.filter(x => x.include_in_sitemap !== false).map(x => String(x.id)));
const allowedCategoryNames = new Set(categories.filter(x => x.include_in_sitemap !== false).map(x => String(x.name || '').trim()));
const allowedCategorySlugs = new Set(categories.filter(x => x.include_in_sitemap !== false).map(x => String(x.slug || '').trim()));

function allowedInSitemap(a) {
  if (isSpecialTopic(a)) return true;
  if (!categories.length) return true;
  if (a?.category_id) return allowedCategoryIds.has(String(a.category_id));
  if (a?.category_name) {
    const name=String(a.category_name).trim();
    const fallbackSlug=FALLBACK.get(name)||'';
    return allowedCategoryNames.has(name)||Boolean(fallbackSlug&&allowedCategorySlugs.has(fallbackSlug));
  }
  return true;
}
function expectedIndexArticles() {
  const seenTitles=new Set();
  const seenBodies=new Set();
  const selected=[];
  for(const a of [...articles].sort((x,y)=>timeOf(x)-timeOf(y))){
    if(!allowedInSitemap(a))continue;
    const body=visibleText(a.content||a.summary||'');
    const title=visibleText(a.title||'');
    if(title.length<MIN_INDEXABLE_TITLE_LENGTH||body.length<MIN_INDEXABLE_BODY_LENGTH)continue;
    const titleKey=normalizedTitle(a.title);
    const bodyKey=body.length>=120?body:'';
    if((titleKey.length>=8&&seenTitles.has(titleKey))||(bodyKey&&seenBodies.has(bodyKey)))continue;
    if(titleKey.length>=8)seenTitles.add(titleKey);
    if(bodyKey)seenBodies.add(bodyKey);
    selected.push(a);
  }
  return selected.sort((x,y)=>timeOf(y)-timeOf(x)).slice(0,MAX_SITEMAP_ARTICLES);
}

// 1. 文章发布链路一致性治理：数据库层先保证每篇文章只有一个稳定 canonical。
record(1, articles.length > 3000, '已加载完整已发布文章库', `published=${articles.length}`);
record(1, articles.every(a => a.id && a.title && a.slug), '已发布文章均具备 id/title/slug', `missing=${articles.filter(a => !a.id || !a.title || !a.slug).length}`);
const duplicateSlugs = [...articles.reduce((m,a) => { const k=String(a.slug||''); m.set(k,(m.get(k)||0)+1); return m; }, new Map())].filter(([k,n]) => k && n > 1);
record(1, duplicateSlugs.length === 0, '已发布 slug 全局唯一', duplicateSlugs.slice(0,6).map(([k,n])=>`${k}:${n}`).join(' | '));
const canonicalValues = [...canonicalMap.values()];
record(1, new Set(canonicalValues).size === canonicalValues.length, '每篇文章 canonical 唯一', `unique=${new Set(canonicalValues).size}/${canonicalValues.length}`);

// 2. 全站文章链接实时存活检查：按栏目/专题均匀抽取最新文章，真实请求生产正文。
const groups = new Map();
for (const a of articles) {
  const section = sectionFor(a, byId, byName);
  if (!groups.has(section)) groups.set(section, []);
  if (groups.get(section).length < 8) groups.get(section).push(a);
}
const liveSamples = uniqueBy([...groups.values()].flat().slice(0, 80), a => a.id);
record(2, liveSamples.length >= 20, '取得跨栏目文章存活样本', `samples=${liveSamples.length}`);
await pool(liveSamples, 10, async (a) => {
  const url = canonicalMap.get(String(a.id));
  try {
    const r = await req(url, {redirect:'follow', headers:{'cache-control':'no-cache'}});
    const html = await r.text();
    const ok = r.status === 200 && !missing(html) && h1(html).includes(String(a.title).slice(0, Math.min(12, String(a.title).length))) && /data-prerendered=["']true["']/i.test(html);
    record(2, ok, '文章生产链接与数据库标题一致', `${r.status} ${url}`);
  } catch (e) { record(2, false, '文章生产链接请求失败', `${url} ${e.message || e}`); }
});

// 3. 修改/删除/旧链接机制：legacy id 与 stale pretty slug 都必须收口到当前 canonical。
const rescueSamples = articles.filter(a => stableSuffix(a.slug)).slice(0, 5);
for (const a of rescueSamples) {
  const canonical = canonicalMap.get(String(a.id));
  try {
    const legacy = await req(`${ORIGIN}/article.html?id=${encodeURIComponent(a.id)}`, {redirect:'manual'});
    record(3, legacy.status === 301 && legacy.headers.get('location') === canonical, 'legacy id 一跳到当前 canonical', `${legacy.status} ${legacy.headers.get('location') || ''}`);
  } catch (e) { record(3, false, 'legacy id 重定向请求', e.message || String(e)); }
  try {
    const suffix = stableSuffix(a.slug);
    const stale = `${ORIGIN}/${encodeURIComponent(sectionFor(a, byId, byName))}/${encodeURIComponent(`旧标题-${suffix}`)}`;
    const r = await req(stale, {redirect:'manual'});
    record(3, r.status === 301 && r.headers.get('location') === canonical, '过期 pretty slug 自动救援', `${r.status} ${r.headers.get('location') || ''}`);
  } catch (e) { record(3, false, '过期 pretty slug 救援请求', e.message || String(e)); }
}

// 4. 站内搜索系统：确认生产脚本已切换到全库 Supabase 检索，并用中文词真实查库。
try {
  const js = await (await req(`${ORIGIN}/listing.js?v=20260819-r12`, {headers:{'cache-control':'no-cache'}})).text();
  record(4, /fetchLiveSearchArticles/.test(js) && /content\.ilike/.test(js), '搜索脚本启用全库正文检索');
  record(4, /https:\/\/trrb\.net(?:\/|\$\{)/.test(js), '栏目 canonical 使用非www主域');
  const u = new URL(`${SUPABASE_URL}/rest/v1/articles`);
  u.searchParams.set('select','id,title,slug,topic_key,category_name');
  u.searchParams.set('status','eq.published');
  u.searchParams.set('or','(title.ilike.*特朗普*,summary.ilike.*特朗普*,content.ilike.*特朗普*)');
  u.searchParams.set('limit','20');
  const r = await req(u, {headers:DB_HEADERS});
  const rows = r.ok ? await r.json() : [];
  record(4, r.ok && Array.isArray(rows) && rows.length > 0 && rows.every(x => x.slug), '中文关键词数据库搜索可用', `status=${r.status}; results=${Array.isArray(rows)?rows.length:0}`);
} catch (e) { record(4, false, '搜索生产检查', e.message || String(e)); }

// 5. 首页热榜与推荐数据一致性：确保首页实时数据包含 slug/topic，并使用统一 bundle 与 canonical pretty URL。
try {
  const homeJs = await (await req(`${ORIGIN}/articles-home.js`, {headers:{'cache-control':'no-cache'}})).text();
  record(5, /"slug"/.test(homeJs) && /"topic_key"/.test(homeJs), '首页实时数据包含 slug/topic_key');
  record(5, /function articleUrl\(/.test(homeJs) && /important-news/.test(homeJs) && /us-crime/.test(homeJs), '首页直接生成 canonical pretty URL');
  record(5, /public-home-bundle/.test(homeJs) && !/Promise\.all\(coreCategories/.test(homeJs), '首页首屏使用单一实时 bundle');
} catch (e) { record(5, false, '首页数据链路检查', e.message || String(e)); }

// 6. 新闻图片与封面链路：验证 placeholder 与最近文章中的同站图片；外站图片只记录可达性警告。
try {
  const p = await req(`${ORIGIN}/image-placeholder.svg`);
  record(6, p.status === 200, '图片 fallback 可访问', `status=${p.status}`);
} catch (e) { record(6, false, '图片 fallback 请求', e.message || String(e)); }
const imageSamples = uniqueBy(articles.filter(a => a.cover_image).slice(0, 50), a => a.cover_image);
await pool(imageSamples, 8, async (a) => {
  let url = String(a.cover_image || '').trim();
  if (url.startsWith('/')) url = ORIGIN + url;
  if (!/^https?:\/\//i.test(url)) return;
  try {
    const r = await req(url, {method:'GET', redirect:'follow', headers:{Range:'bytes=0-2048'}});
    const sameSite = new URL(url).hostname.endsWith('trrb.net');
    record(6, r.status >= 200 && r.status < 400, sameSite ? '同站封面可访问' : '外站封面可访问', `${r.status} ${url}`, sameSite ? 'error' : 'warning');
  } catch (e) {
    const sameSite = (()=>{try{return new URL(url).hostname.endsWith('trrb.net')}catch{return false}})();
    record(6, false, sameSite ? '同站封面请求失败' : '外站封面请求失败', `${url} ${e.message || e}`, sameSite ? 'error' : 'warning');
  }
});

// 7. 缓存/CDN策略：静态资产至少10分钟，文章HTML保持短缓存以保证新闻更新。
for (const path of ['/styles.css','/site-common.js','/trrb-logo-cropped.webp','/article-v31.css']) {
  try {
    const r = await req(`${ORIGIN}${path}`, {method:'HEAD'});
    const cc = r.headers.get('cache-control') || '';
    const maxAge = Number(cc.match(/max-age=(\d+)/i)?.[1] || 0);
    record(7, r.status === 200, `${path} HTTP 200`, `${r.status}`);
    record(7, maxAge >= 600, `${path} 静态缓存>=600秒`, cc);
  } catch (e) { record(7, false, `${path} 缓存请求`, e.message || String(e)); }
}
if (articles[0]) {
  try {
    const r = await req(canonicalMap.get(String(articles[0].id)), {method:'HEAD'});
    const cc = r.headers.get('cache-control') || '';
    const maxAge = Number(cc.match(/max-age=(\d+)/i)?.[1] || 0);
    record(7, r.status === 200 && maxAge <= 300, '文章HTML短缓存<=300秒', `${r.status} ${cc}`);
  } catch (e) { record(7, false, '文章HTML缓存请求', e.message || String(e)); }
}

// 8. 移动端深度验收：本脚本先做iPhone UA生产入口；浏览器视觉验收由独立Round12 mobile workflow关闭。
for (const path of ['/','/important-news','/us-crime','/trump','/ice','/listing.html?q=特朗普']) {
  try {
    const r = await req(`${ORIGIN}${path}`, {redirect:'follow'});
    const text = await r.text();
    record(8, r.status === 200 && !missing(text), `iPhone UA入口 ${path}`, `status=${r.status}`);
  } catch (e) { record(8, false, `iPhone UA入口 ${path}`, e.message || String(e)); }
}
record(8, false, '真实浏览器移动端视觉验收尚未执行', '等待 Playwright/iPhone viewport 工作流', 'warning');

// 9. 质量预算索引：只比较去重、正文不少于300字且位于最新5000篇预算内的文章。
try {
  const root = await req(`${ORIGIN}/sitemap.xml`, {headers:{'cache-control':'no-cache'}});
  const rootXml = await root.text();
  const childLocs = [...rootXml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m => m[1].trim().replaceAll('&amp;','&'));
  const articleMaps = childLocs.filter(x => /sitemap-articles/i.test(x));
  const sitemapUrls = [];
  if (articleMaps.length) {
    for (const mapUrl of articleMaps) {
      const r = await req(mapUrl, {headers:{'cache-control':'no-cache'}});
      const xml = await r.text();
      sitemapUrls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(m => m[1].trim().replaceAll('&amp;','&')).filter(isArticleCanonicalUrl));
    }
  } else {
    sitemapUrls.push(...childLocs.filter(isArticleCanonicalUrl));
  }
  const expectedArticles = expectedIndexArticles();
  const dbSet = new Set(expectedArticles.map(a => canonicalMap.get(String(a.id))));
  const siteSet = new Set(sitemapUrls);
  const missingFromSitemap = [...dbSet].filter(x => !siteSet.has(x));
  const staleInSitemap = [...siteSet].filter(x => !dbSet.has(x));
  record(9, siteSet.size === dbSet.size, '文章Sitemap数量与当前应索引文章集合一致', `sitemap=${siteSet.size}; expected=${dbSet.size}`);
  record(9, missingFromSitemap.length === 0, '所有应索引 canonical 均在 Sitemap', `missing=${missingFromSitemap.length}`);
  record(9, staleInSitemap.length === 0, 'Sitemap 无下线/薄稿/重复稿多余URL', `stale=${staleInSitemap.length}`);
  record(9, !sitemapUrls.some(x => /article\.html\?id=|www\.trrb\.net/i.test(x)), 'Sitemap 无旧参数URL或www');
  record(9, expectedArticles.every(a => visibleText(a.content||a.summary||'').length >= MIN_INDEXABLE_BODY_LENGTH), 'Sitemap不再接纳不足300字的短稿', `expected=${expectedArticles.length}`);
} catch (e) { record(9, false, '全量Sitemap索引检查', e.message || String(e)); }

for (let i = 1; i <= 9; i++) {
  const n = nodes[String(i)];
  const hardFail = n.checks.some(c => !c.ok && c.severity !== 'warning');
  const warn = n.checks.some(c => !c.ok && c.severity === 'warning');
  n.status = hardFail ? 'failed' : warn ? 'warning' : 'pass';
}
const hardFailures = failures.length;
nodes['10'].status = hardFailures === 0 && nodes['8'].status === 'pass' ? 'pass' : 'blocked';
nodes['10'].checks.push({ok:nodes['10'].status==='pass', label:'第十二轮最终总验收', detail:`hardFailures=${hardFailures}; node8=${nodes['8'].status}`});

const report = {generated_at:new Date().toISOString(), origin:ORIGIN, published_articles:articles.length, index_eligible_articles:expectedIndexArticles().length, categories:categories.length, failures, warnings, nodes};
fs.writeFileSync('round12-production-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Round 12 audit: published=${articles.length}; indexEligible=${expectedIndexArticles().length}; hardFailures=${failures.length}; warnings=${warnings.length}`);
for (let i=1;i<=10;i++) console.log(`node ${i}: ${nodes[String(i)].status}`);
if (failures.length) {
  failures.slice(0,80).forEach(x => console.error(`node ${x.node}: ${x.label} — ${x.detail}`));
  process.exit(1);
}
console.log('ROUND 12 HARD GATE PASS; mobile visual gate pending if node8=warning');
