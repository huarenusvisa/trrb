#!/usr/bin/env node

const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const SUPABASE_URL = 'https://fwiznbpsqkfgkvyznebz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const DB_HEADERS = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json' };
const MIN_INDEXABLE_BODY_LENGTH = 300;
const MIN_INDEXABLE_TITLE_LENGTH = 8;
const FALLBACK = new Map([
  ['重要新闻','important-news'],['热门头条','hot-headlines'],['美国时政','us-politics'],['美国警情','us-crime'],
  ['中国官场','china-officialdom'],['移民美国','immigration'],['庇护百科','asylum'],['驱逐快报','deport'],
  ['ICE执法动态','ice'],['ICE执法','ice'],['曝光墙','expose']
]);

function fail(message) { console.error(`ROUND13 NODE1 FAIL: ${message}`); process.exitCode = 1; }
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const clean = (v='') => String(v ?? '').replace(/\s+/g,' ').trim();
const visible = (v='') => clean(v).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&[a-z0-9#]+;/gi,' ').replace(/\s+/g,' ').trim();
const normTitle = (v='') => visible(v).toLowerCase().replace(/[\p{P}\p{S}\s]+/gu,'');

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, { redirect: 'follow', ...options, headers: { 'user-agent': 'TRRB-Round13-Freshness/2.0', 'cache-control': 'no-cache', pragma: 'no-cache', ...(options.headers || {}) }, signal: controller.signal });
  } finally { clearTimeout(timer); }
}
async function db(path, params) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const r = await request(url, { headers: DB_HEADERS });
  if (!r.ok) throw new Error(`${path} ${r.status}: ${(await r.text()).slice(0,200)}`);
  return r.json();
}
async function dbAll(path, params, pageSize=1000) {
  const out=[];
  for(let offset=0;offset<100000;offset+=pageSize){
    const rows=await db(path,{...params,limit:String(pageSize),offset:String(offset)});
    if(!Array.isArray(rows)) break;
    out.push(...rows);
    if(rows.length<pageSize) break;
  }
  return out;
}

function sectionFor(article, byId, byName) {
  const topic = clean(article.topic_key).toLowerCase();
  if (topic === 'trump') return 'trump';
  if (topic === 'ice') return 'ice';
  const byCategoryId = byId.get(String(article.category_id || ''));
  if (byCategoryId?.slug) return clean(byCategoryId.slug);
  const byCategoryName = byName.get(clean(article.category_name));
  if (byCategoryName?.slug) return clean(byCategoryName.slug);
  return FALLBACK.get(clean(article.category_name)) || 'news';
}
function canonicalFor(article, byId, byName) { return `${ORIGIN}/${encodeURIComponent(sectionFor(article, byId, byName))}/${encodeURIComponent(clean(article.slug || article.id))}`; }
function containsMissingMessage(html) { return /文章不存在|文章已下线|链接可能已经失效|该文章已删除/i.test(String(html || '')); }
function isIce(article){const t=clean(article?.topic_key).toLowerCase();const c=clean(article?.category_name);return t==='ice'||c==='ICE执法动态'||c==='ICE执法';}
function isSpecial(article){const t=clean(article?.topic_key).toLowerCase();return t==='ice'||t==='trump';}
function timeOf(article){const t=Date.parse(article?.published_at||article?.created_at||'');return Number.isFinite(t)?t:0;}

async function waitForEntry(path, label, candidates, attempts = 18, delayMs = 10000) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const separator = path.includes('?') ? '&' : '?';
      const r = await request(`${ORIGIN}${path}${separator}round13=${Date.now()}-${attempt}`);
      const text = await r.text();
      lastStatus = r.status;
      const hit = candidates.some(value => text.includes(value.replaceAll('&','&amp;')) || text.includes(value));
      if (r.status === 200 && hit) { console.log(`PASS ${label}: status=${r.status}; attempt=${attempt}`); return true; }
      console.log(`WAIT ${label}: status=${r.status}; attempt=${attempt}/${attempts}; hit=${hit}`);
    } catch (e) { console.log(`WAIT ${label}: attempt=${attempt}/${attempts}; ${e.message || e}`); }
    if (attempt < attempts) await sleep(delayMs);
  }
  console.log(`FAIL ${label}: lastStatus=${lastStatus}`);
  return false;
}

const categories = await db('categories', { select: 'id,name,slug,include_in_sitemap,include_in_google_news,include_in_rss', is_active: 'eq.true', limit: '500' });
const articles = await dbAll('articles', { select: 'id,title,slug,summary,content,category_id,category_name,topic_key,status,published_at,created_at', status: 'eq.published', order: 'published_at.asc.nullslast,created_at.asc' });
if (!Array.isArray(articles) || articles.length < 10) { fail(`published sample too small: ${Array.isArray(articles) ? articles.length : 0}`); process.exit(); }
const byId = new Map(categories.map(x => [String(x.id || ''), x]));
const byName = new Map(categories.map(x => [clean(x.name), x]));
function allowed(article, flag){if(isSpecial(article))return true;if(!categories.length)return true;const c=article.category_id?byId.get(String(article.category_id)):byName.get(clean(article.category_name));if(c)return c[flag]!==false;const fallbackSlug=FALLBACK.get(clean(article.category_name))||'';return Boolean(fallbackSlug&&categories.some(x=>clean(x.slug)===fallbackSlug&&x[flag]!==false));}

const indexEligible=[];const seenTitles=new Set();const seenBodies=new Set();
for(const article of articles){
  if(!article?.id||!clean(article.title)||!clean(article.slug)||!allowed(article,'include_in_sitemap'))continue;
  const body=visible(article.content||article.summary||'');
  if(visible(article.title).length<MIN_INDEXABLE_TITLE_LENGTH||body.length<MIN_INDEXABLE_BODY_LENGTH)continue;
  const titleKey=normTitle(article.title);const bodyKey=body.length>=120?body:'';
  if((titleKey.length>=8&&seenTitles.has(titleKey))||(bodyKey&&seenBodies.has(bodyKey)))continue;
  if(titleKey.length>=8)seenTitles.add(titleKey);if(bodyKey)seenBodies.add(bodyKey);
  indexEligible.push(article);
}
const latestPublished=[...articles].sort((a,b)=>timeOf(b)-timeOf(a));
const latestIndexable=[...indexEligible].sort((a,b)=>timeOf(b)-timeOf(a));
const latest=latestIndexable[0];
const latestUrl=latest?canonicalFor(latest,byId,byName):'';
if(!latest){fail('no index-eligible published article found');process.exit();}
console.log(`Latest index-eligible article: ${latest.id} | ${latest.title}`);
console.log(`Latest canonical: ${latestUrl}`);

// Gate A: latest published articles must resolve even when a deliberate noindex policy excludes one from Sitemap.
let articleFailures = 0;
for (const article of latestPublished.slice(0, 12)) {
  const url = canonicalFor(article, byId, byName);
  try {
    const r = await request(`${url}?round13=${Date.now()}`);
    const html = await r.text();
    const titlePrefix = clean(article.title).slice(0, Math.min(10, clean(article.title).length));
    const ok = r.status === 200 && !containsMissingMessage(html) && html.includes(titlePrefix) && /data-prerendered=["']true["']/i.test(html);
    console.log(`${ok ? 'PASS' : 'FAIL'} article ${r.status}: ${url}`);
    if (!ok) articleFailures += 1;
  } catch (e) { console.log(`FAIL article request: ${url} ${e.message || e}`); articleFailures += 1; }
}
if (articleFailures) fail(`latest article canonical failures=${articleFailures}`);

// Gate B: newest article that is actually eligible for indexing must converge into the main Sitemap.
const sitemapOk = await waitForEntry('/sitemap.xml', 'sitemap latest index-eligible article', [latestUrl]);
if (!sitemapOk) fail('latest index-eligible article missing from sitemap.xml after convergence window');

// Gate C: News Sitemap and RSS must converge using their own current eligibility rules.
const now=Date.now(),cutoff=now-48*60*60*1000;
const newsCandidates=latestIndexable.filter(a=>allowed(a,'include_in_google_news')&&timeOf(a)>=cutoff&&timeOf(a)<=now+300000).slice(0,20).map(a=>canonicalFor(a,byId,byName));
const rssCandidates=latestPublished.filter(a=>allowed(a,'include_in_rss')).slice(0,20).map(a=>canonicalFor(a,byId,byName));
const newsOk = newsCandidates.length && await waitForEntry('/news-sitemap.xml','news sitemap',newsCandidates,6,5000);
if(!newsOk) fail('news sitemap has no recent eligible published article after convergence window');
const rssOk = rssCandidates.length && await waitForEntry('/feed.xml','RSS feed',rssCandidates,6,5000);
if(!rssOk) fail('RSS feed has no recent eligible published article after convergence window');

if (!process.exitCode) console.log('ROUND13 NODE1 PASS: latest article publish and index-eligible discovery chains are live and converged');
