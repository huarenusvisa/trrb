#!/usr/bin/env node

const ORIGIN=String(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/+$/,'');
const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
const KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const H={apikey:KEY,Authorization:`Bearer ${KEY}`,Accept:'application/json'};
const MIN_INDEXABLE_BODY_LENGTH=80;
const FALLBACK=new Map([['重要新闻','important-news'],['热门头条','hot-headlines'],['美国时政','us-politics'],['美国警情','us-crime'],['中国官场','china-officialdom'],['移民美国','immigration'],['庇护百科','asylum'],['驱逐快报','deport'],['ICE执法动态','ice'],['ICE执法','ice'],['曝光墙','expose']]);
const checks=[];const failures=[];
const clean=(v='')=>String(v??'').replace(/\s+/g,' ').trim();
const visible=(v='')=>clean(v).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&[a-z0-9#]+;/gi,' ').replace(/\s+/g,' ').trim();
const normTitle=(v='')=>visible(v).toLowerCase().replace(/[\p{P}\p{S}\s]+/gu,'');
function record(ok,label,detail=''){checks.push({ok,label,detail});console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);if(!ok)failures.push({label,detail});}
async function db(table,params){const u=new URL(`${SUPABASE_URL}/rest/v1/${table}`);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));const r=await fetch(u,{headers:H,cache:'no-store'});if(!r.ok)throw new Error(`${table} ${r.status}: ${(await r.text()).slice(0,180)}`);return r.json();}
async function dbAll(table,params,pageSize=1000){const out=[];for(let offset=0;offset<100000;offset+=pageSize){const rows=await db(table,{...params,limit:String(pageSize),offset:String(offset)});if(!Array.isArray(rows))break;out.push(...rows);if(rows.length<pageSize)break;}return out;}
async function get(path){const r=await fetch(`${ORIGIN}${path}?round13node3=${Date.now()}`,{headers:{'cache-control':'no-cache',pragma:'no-cache','user-agent':'TRRB-Round13-Node3/2.1'}});return {status:r.status,headers:r.headers,text:await r.text()};}
const categories=await db('categories',{select:'id,name,slug,is_active,include_in_sitemap,include_in_google_news,include_in_rss',is_active:'eq.true',limit:'500'});
const articles=await dbAll('articles',{select:'id,title,slug,summary,content,category_id,category_name,topic_key,status,published_at,created_at',status:'eq.published',order:'published_at.asc.nullslast,created_at.asc'});
const byId=new Map(categories.map(x=>[String(x.id||''),x]));const byName=new Map(categories.map(x=>[clean(x.name),x]));
function section(a){const t=clean(a.topic_key).toLowerCase();if(t==='trump')return'trump';if(t==='ice')return'ice';return clean(byId.get(String(a.category_id||''))?.slug)||clean(byName.get(clean(a.category_name))?.slug)||FALLBACK.get(clean(a.category_name))||'news';}
function canonical(a){return `${ORIGIN}/${encodeURIComponent(section(a))}/${encodeURIComponent(clean(a.slug||a.id))}`;}
function special(a){const t=clean(a?.topic_key).toLowerCase();return t==='trump'||t==='ice';}
function ice(a){const t=clean(a?.topic_key).toLowerCase();const c=clean(a?.category_name);return t==='ice'||c==='ICE执法动态'||c==='ICE执法';}
function allowed(a,flag){if(special(a))return true;if(!categories.length)return true;const c=a.category_id?byId.get(String(a.category_id)):byName.get(clean(a.category_name));return c?c[flag]!==false:true;}
function timestamp(a){const t=Date.parse(a?.published_at||a?.created_at||'');return Number.isFinite(t)?t:0;}

// Main/News sitemap exact duplicate policy keeps the earliest published copy.
const seenTitles=new Set();const seenBodies=new Set();const mainEligible=[];
for(const a of articles){
  if(!a?.id||!clean(a.title)||!clean(a.slug)||!allowed(a,'include_in_sitemap'))continue;
  const body=visible(a.content||a.summary||'');
  if(ice(a)?!body:body.length<MIN_INDEXABLE_BODY_LENGTH)continue;
  const titleKey=normTitle(a.title);const bodyKey=body.length>=120?body:'';
  if((titleKey.length>=8&&seenTitles.has(titleKey))||(bodyKey&&seenBodies.has(bodyKey)))continue;
  if(titleKey.length>=8)seenTitles.add(titleKey);if(bodyKey)seenBodies.add(bodyKey);
  mainEligible.push(a);
}
const latestSitemap=[...mainEligible].sort((a,b)=>timestamp(b)-timestamp(a))[0]||null;

const now=Date.now(),cutoff=now-48*60*60*1000;
const newsSeenTitles=new Set();const newsSeenBodies=new Set();const newsEligible=[];
for(const a of articles.filter(a=>{const ts=timestamp(a);return ts>=cutoff&&ts<=now+300000;}).sort((a,b)=>timestamp(a)-timestamp(b))){
  if(!a?.id||!clean(a.title)||!clean(a.slug)||!allowed(a,'include_in_google_news'))continue;
  const body=visible(a.content||a.summary||'');
  if(ice(a)?!body:body.length<MIN_INDEXABLE_BODY_LENGTH)continue;
  const titleKey=normTitle(a.title);const bodyKey=body.length>=120?body:'';
  if((titleKey.length>=8&&newsSeenTitles.has(titleKey))||(bodyKey&&newsSeenBodies.has(bodyKey)))continue;
  if(titleKey.length>=8)newsSeenTitles.add(titleKey);if(bodyKey)newsSeenBodies.add(bodyKey);
  newsEligible.push(a);
}
const latestNews=[...newsEligible].sort((a,b)=>timestamp(b)-timestamp(a))[0]||null;
const latestRss=[...articles].filter(a=>a?.id&&clean(a.title)&&clean(a.slug)&&allowed(a,'include_in_rss')).sort((a,b)=>timestamp(b)-timestamp(a))[0]||null;

record(articles.length>=3000,'读取完整已发布文章库',`published=${articles.length}`);
record(Boolean(latestSitemap&&latestRss&&latestNews),'取得三个实时SEO目标',`sitemap=${latestSitemap?.id||''}; news=${latestNews?.id||''}; rss=${latestRss?.id||''}`);
const sitemap=await get('/sitemap.xml');const news=await get('/news-sitemap.xml');const feed=await get('/feed.xml');
record(sitemap.status===200,'主 Sitemap HTTP 200',`status=${sitemap.status}`);
record(news.status===200,'News Sitemap HTTP 200',`status=${news.status}`);
record(feed.status===200,'RSS HTTP 200',`status=${feed.status}`);
const sitemapVersion=sitemap.headers.get('x-trrb-sitemap')||'';
const newsVersion=news.headers.get('x-trrb-news-sitemap')||'';
const feedVersion=feed.headers.get('x-trrb-feed')||'';
record(/topic-safe/i.test(sitemapVersion)&&/ice-safe/i.test(sitemapVersion),'主 Sitemap 启用专题与短ICE保护实时Edge',sitemapVersion||'missing');
record(/paged/i.test(newsVersion)&&/public-only/i.test(newsVersion)&&/ice-safe/i.test(newsVersion)&&/dedupe/i.test(newsVersion),'News Sitemap 启用分页/公开性/短ICE/去重实时Edge',newsVersion||'missing');
record(/topic-safe/i.test(feedVersion),'RSS 启用专题canonical实时Edge',feedVersion||'missing');
for(const [label,obj] of [['主 Sitemap',sitemap],['News Sitemap',news],['RSS',feed]]){const cc=obj.headers.get('cache-control')||'';const age=Number(cc.match(/max-age=(\d+)/i)?.[1]||999999);record(age<=30,`${label} 缓存上限<=30秒`,cc);record(!/\/article\.html\?id=/i.test(obj.text),`${label} 无 legacy article?id 链接`);record(!/https:\/\/www\.trrb\.net/i.test(obj.text),`${label} 无 www 重复主域`);}
if(latestSitemap)record(sitemap.text.includes(canonical(latestSitemap)), '最新 Sitemap 合格文章首请求即出现',canonical(latestSitemap));
if(latestNews)record(news.text.includes(canonical(latestNews)), '最新 News 合格文章首请求即出现',canonical(latestNews));
if(latestRss)record(feed.text.includes(canonical(latestRss)), '最新 RSS 合格文章首请求即出现',canonical(latestRss));
record(/<urlset\b/i.test(sitemap.text),'主 Sitemap XML 根节点正确');
record(/xmlns:news="http:\/\/www\.google\.com\/schemas\/sitemap-news\/0\.9"/i.test(news.text)&&/<news:news>/i.test(news.text),'News Sitemap Google News XML正确');
record(/<rss\b[^>]*version="2\.0"/i.test(feed.text)&&/<channel>/i.test(feed.text),'RSS 2.0 XML正确');
console.log(`ROUND13 NODE3 audit: checks=${checks.length}; failures=${failures.length}`);
if(failures.length){failures.forEach(x=>console.error(`FAIL ${x.label} — ${x.detail}`));process.exit(1);}console.log('ROUND13 NODE3 PASS: Sitemap / RSS automatic discovery path verified');
