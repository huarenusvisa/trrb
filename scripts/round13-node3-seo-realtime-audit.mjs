#!/usr/bin/env node

const ORIGIN=String(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/+$/,'');
const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
const KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const H={apikey:KEY,Authorization:`Bearer ${KEY}`,Accept:'application/json'};
const FALLBACK=new Map([['重要新闻','important-news'],['热门头条','hot'],['美国时政','us-politics'],['美国警情','us-crime'],['中国官场','china-officialdom'],['移民美国','immigration'],['庇护百科','asylum'],['驱逐快报','deport'],['ICE执法动态','ice'],['ICE执法','ice'],['曝光墙','expose']]);
const checks=[];const failures=[];
const clean=(v='')=>String(v??'').replace(/\s+/g,' ').trim();
function record(ok,label,detail=''){checks.push({ok,label,detail});console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);if(!ok)failures.push({label,detail});}
async function db(table,params){const u=new URL(`${SUPABASE_URL}/rest/v1/${table}`);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));const r=await fetch(u,{headers:H,cache:'no-store'});if(!r.ok)throw new Error(`${table} ${r.status}: ${(await r.text()).slice(0,180)}`);return r.json();}
async function get(path){const r=await fetch(`${ORIGIN}${path}?round13node3=${Date.now()}`,{headers:{'cache-control':'no-cache',pragma:'no-cache','user-agent':'TRRB-Round13-Node3/1.0'}});return {status:r.status,headers:r.headers,text:await r.text()};}
const categories=await db('categories',{select:'id,name,slug,is_active,include_in_sitemap,include_in_google_news,include_in_rss',is_active:'eq.true',limit:'500'});
const articles=await db('articles',{select:'id,title,slug,category_id,category_name,topic_key,status,published_at,created_at',status:'eq.published',order:'published_at.desc.nullslast,created_at.desc',limit:'300'});
const byId=new Map(categories.map(x=>[String(x.id||''),x]));const byName=new Map(categories.map(x=>[clean(x.name),x]));
function section(a){const t=clean(a.topic_key).toLowerCase();if(t==='trump')return'trump';if(t==='ice')return'ice';return clean(byId.get(String(a.category_id||''))?.slug)||clean(byName.get(clean(a.category_name))?.slug)||FALLBACK.get(clean(a.category_name))||'news';}
function canonical(a){return `${ORIGIN}/${encodeURIComponent(section(a))}/${encodeURIComponent(clean(a.slug||a.id))}`;}
function allowed(a,flag){if(!categories.length)return true;const c=a.category_id?byId.get(String(a.category_id)):byName.get(clean(a.category_name));return c?c[flag]!==false:true;}
const latestSitemap=articles.find(a=>a.id&&clean(a.title)&&clean(a.slug)&&allowed(a,'include_in_sitemap'));
const latestRss=articles.find(a=>a.id&&clean(a.title)&&clean(a.slug)&&allowed(a,'include_in_rss'));
const now=Date.now(),cutoff=now-48*60*60*1000;
const latestNews=articles.find(a=>{const ts=Date.parse(a.published_at||a.created_at||'');return a.id&&clean(a.title)&&clean(a.slug)&&allowed(a,'include_in_google_news')&&Number.isFinite(ts)&&ts>=cutoff&&ts<=now+300000;});
record(Boolean(latestSitemap&&latestRss&&latestNews),'取得三个实时SEO目标',`sitemap=${latestSitemap?.id||''}; news=${latestNews?.id||''}; rss=${latestRss?.id||''}`);
const sitemap=await get('/sitemap.xml');const news=await get('/news-sitemap.xml');const feed=await get('/feed.xml');
record(sitemap.status===200,'主 Sitemap HTTP 200',`status=${sitemap.status}`);
record(news.status===200,'News Sitemap HTTP 200',`status=${news.status}`);
record(feed.status===200,'RSS HTTP 200',`status=${feed.status}`);
record(sitemap.headers.get('x-trrb-sitemap')==='live-supabase-v1','主 Sitemap 走实时 Supabase Edge',sitemap.headers.get('x-trrb-sitemap')||'missing');
record(news.headers.get('x-trrb-news-sitemap')==='live-supabase-v1','News Sitemap 走实时 Supabase Edge',news.headers.get('x-trrb-news-sitemap')||'missing');
record(feed.headers.get('x-trrb-feed')==='live-supabase-v1','RSS 走实时 Supabase Edge',feed.headers.get('x-trrb-feed')||'missing');
for(const [label,obj] of [['主 Sitemap',sitemap],['News Sitemap',news],['RSS',feed]]){const cc=obj.headers.get('cache-control')||'';const age=Number(cc.match(/max-age=(\d+)/i)?.[1]||999999);record(age<=30,`${label} 缓存上限<=30秒`,cc);record(!/\/article\.html\?id=/i.test(obj.text),`${label} 无 legacy article?id 链接`);record(!/https:\/\/www\.trrb\.net/i.test(obj.text),`${label} 无 www 重复主域`);}
if(latestSitemap)record(sitemap.text.includes(canonical(latestSitemap)), '最新 Sitemap 合格文章首请求即出现',canonical(latestSitemap));
if(latestNews)record(news.text.includes(canonical(latestNews)), '最新 News 合格文章首请求即出现',canonical(latestNews));
if(latestRss)record(feed.text.includes(canonical(latestRss)), '最新 RSS 合格文章首请求即出现',canonical(latestRss));
record(/<urlset\b/i.test(sitemap.text),'主 Sitemap XML 根节点正确');
record(/xmlns:news="http:\/\/www\.google\.com\/schemas\/sitemap-news\/0\.9"/i.test(news.text)&&/<news:news>/i.test(news.text),'News Sitemap Google News XML正确');
record(/<rss\b[^>]*version="2\.0"/i.test(feed.text)&&/<channel>/i.test(feed.text),'RSS 2.0 XML正确');
console.log(`ROUND13 NODE3 audit: checks=${checks.length}; failures=${failures.length}`);
if(failures.length){failures.forEach(x=>console.error(`FAIL ${x.label} — ${x.detail}`));process.exit(1);}console.log('ROUND13 NODE3 PASS: Sitemap / RSS automatic zero-delay production path verified');
