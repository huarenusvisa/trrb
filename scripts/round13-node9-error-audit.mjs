#!/usr/bin/env node
import fs from 'node:fs';

const ORIGIN=String(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/+$/,'');
const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
const KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const H={apikey:KEY,Authorization:`Bearer ${KEY}`,Accept:'application/json'};
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const failures=[];const checks=[];
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function record(ok,label,detail=''){checks.push({ok,label,detail});console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);if(!ok)failures.push({label,detail});}
async function dbAll(table,select,extra={}){const out=[];for(let offset=0;;offset+=1000){const u=new URL(`${SUPABASE_URL}/rest/v1/${table}`);u.searchParams.set('select',select);Object.entries(extra).forEach(([k,v])=>u.searchParams.set(k,String(v)));u.searchParams.set('limit','1000');u.searchParams.set('offset',String(offset));const r=await fetch(u,{headers:H});if(!r.ok)throw new Error(`${table} ${r.status}`);const rows=await r.json();out.push(...rows);if(rows.length<1000)break;}return out;}
const clean=v=>String(v||'').trim();
const cats=await dbAll('categories','id,name,slug,is_active,include_in_sitemap',{is_active:'eq.true'});
const arts=await dbAll('articles','id,title,slug,category_id,category_name,topic_key,status,published_at,created_at',{status:'eq.published',order:'published_at.desc.nullslast,created_at.desc'});
const byId=new Map(cats.map(x=>[String(x.id||''),x]));const byName=new Map(cats.map(x=>[clean(x.name),x]));
const allowedIds=new Set(cats.filter(x=>x.include_in_sitemap!==false).map(x=>String(x.id||'')));
const allowedNames=new Set(cats.filter(x=>x.include_in_sitemap!==false).map(x=>clean(x.name)));
const fallback=new Map([['重要新闻','important-news'],['热门头条','hot-headlines'],['美国时政','us-politics'],['美国警情','us-crime'],['中国官场','china-officialdom'],['移民美国','immigration'],['庇护百科','asylum'],['驱逐快报','deport'],['ICE执法动态','ice'],['ICE执法','ice'],['曝光墙','expose']]);
function categoryFor(a){return a.category_id?byId.get(String(a.category_id)):byName.get(clean(a.category_name));}
function section(a){const t=clean(a.topic_key).toLowerCase();if(t==='trump')return'trump';if(t==='ice')return'ice';const c=categoryFor(a);return clean(c?.slug)||fallback.get(clean(a.category_name))||'news';}
function canonical(a){return `${ORIGIN}/${encodeURIComponent(section(a))}/${encodeURIComponent(clean(a.slug||a.id))}`;}
function includedInSitemap(a){
  if(!cats.length)return true;
  if(a.category_id)return allowedIds.has(String(a.category_id));
  if(clean(a.category_name))return allowedNames.has(clean(a.category_name));
  return true;
}

record(arts.length>3000,'加载完整已发布文章库',`published=${arts.length}`);
record(cats.length>=5,'加载有效栏目配置',`categories=${cats.length}`);
const malformed=arts.filter(a=>!clean(a.id)||!clean(a.title)||!clean(a.slug));
record(malformed.length===0,'全库文章具备id/title/slug',`malformed=${malformed.length}`);
const canonicals=arts.map(canonical);const uniqueCanonicals=[...new Set(canonicals)];
record(uniqueCanonicals.length===arts.length,'全库canonical一对一唯一',`unique=${uniqueCanonicals.length}/${arts.length}`);

async function req(url,{method='GET',redirect='follow'}={}){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);try{return await fetch(url,{method,redirect,headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','accept-language':'zh-CN,zh;q=0.9,en;q=0.7'},signal:controller.signal});}finally{clearTimeout(timer);}}

let sitemapText='';
try{const r=await req(`${ORIGIN}/sitemap.xml`);sitemapText=await r.text();record(r.status===200,'生产Sitemap HTTP 200',`status=${r.status}`);}catch(e){record(false,'生产Sitemap HTTP 200',e.message||String(e));}
const expectedSitemapArticles=arts.filter(includedInSitemap);const excludedSitemapArticles=arts.filter(a=>!includedInSitemap(a));
const expectedUrls=[...new Set(expectedSitemapArticles.map(canonical))];const excludedUrls=[...new Set(excludedSitemapArticles.map(canonical))];
const hasInSitemap=url=>sitemapText.includes(url.replaceAll('&','&amp;'))||sitemapText.includes(url);
const missingFromSitemap=expectedUrls.filter(url=>!hasInSitemap(url));
const wronglyIncluded=excludedUrls.filter(url=>hasInSitemap(url));
record(missingFromSitemap.length===0,'CMS允许收录文章全部进入生产Sitemap',`expected=${expectedUrls.length}; missing=${missingFromSitemap.length}${missingFromSitemap.length?`; ${missingFromSitemap.slice(0,10).join(' | ')}`:''}`);
record(wronglyIncluded.length===0,'CMS排除文章未误入生产Sitemap',`excluded=${excludedUrls.length}; wrongly_included=${wronglyIncluded.length}`);
const sitemapLocs=[...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replaceAll('&amp;','&'));
const duplicateLocs=[...sitemapLocs.reduce((m,u)=>(m.set(u,(m.get(u)||0)+1),m),new Map())].filter(([,n])=>n>1);
record(duplicateLocs.length===0,'生产Sitemap无重复URL',`locs=${sitemapLocs.length}; duplicates=${duplicateLocs.length}`);

const staticCore=['/','/trump','/ice','/ice/news','/listing.html','/sitemap.xml','/news-sitemap.xml','/feed.xml','/styles.css','/site-common.js','/listing.js','/article.js','/trrb-logo-cropped.webp','/image-placeholder.svg'];
const categoryCore=cats.map(c=>clean(c.slug)).filter(Boolean).map(slug=>`/${encodeURIComponent(slug)}`);
const core=[...new Set([...staticCore,...categoryCore])];const coreBad=[];
for(const p of core){try{const r=await req(`${ORIGIN}${p}`,{method:'GET'});if(r.body)await r.body.cancel().catch(()=>{});if(r.status!==200)coreBad.push(`${r.status} ${p}`);}catch(e){coreBad.push(`ERR ${p} ${e.message||e}`);}await sleep(80);}
record(coreBad.length===0,'核心页面/资源真实请求无404/5xx/403',`checked=${core.length}${coreBad.length?`; ${coreBad.slice(0,20).join(' | ')}`:''}`);

const groups=new Map();for(const a of arts){const s=section(a);if(!groups.has(s))groups.set(s,[]);if(groups.get(s).length<8)groups.get(s).push(a);}
const samples=[...groups.values()].flat();const sampleBad=[];
for(const a of samples){const url=canonical(a);try{const r=await req(url,{method:'GET'});if(r.body)await r.body.cancel().catch(()=>{});if(r.status!==200)sampleBad.push(`${r.status} ${url}`);}catch(e){sampleBad.push(`ERR ${url} ${e.message||e}`);}await sleep(120);}
record(sampleBad.length===0,'跨栏目文章真实HTTP抽查无404/5xx/403',`sections=${groups.size}; checked=${samples.length}; bad=${sampleBad.length}${sampleBad.length?`; ${sampleBad.slice(0,20).join(' | ')}`:''}`);

const legacySamples=[];for(const group of groups.values())legacySamples.push(...group.slice(0,2));const legacyBad=[];
for(const a of legacySamples){try{const r=await req(`${ORIGIN}/article.html?id=${encodeURIComponent(a.id)}`,{method:'HEAD',redirect:'manual'});const expected=canonical(a);const loc=r.headers.get('location')||'';if(!((r.status===301||r.status===308)&&loc===expected))legacyBad.push(`${r.status} ${a.id} -> ${loc}`);}catch(e){legacyBad.push(`ERR ${a.id}`);}await sleep(120);}
record(legacyBad.length===0,'跨栏目legacy链接均一跳到canonical',`checked=${legacySamples.length}${legacyBad.length?`; ${legacyBad.slice(0,20).join(' | ')}`:''}`);

const bad=[...missingFromSitemap,...wronglyIncluded,...coreBad,...sampleBad,...legacyBad];
fs.writeFileSync('round13-node9-error-audit.json',JSON.stringify({generated_at:new Date().toISOString(),origin:ORIGIN,published:arts.length,canonical_count:uniqueCanonicals.length,sitemap_expected_articles:expectedUrls.length,sitemap_excluded_articles:excludedUrls.length,sitemap_locs:sitemapLocs.length,sections:[...groups.keys()],failures,checks,bad_urls:bad},null,2)+'\n');
console.log(`ROUND13 NODE9 audit: checks=${checks.length}; failures=${failures.length}`);
if(failures.length){failures.forEach(x=>console.error(`FAIL ${x.label} — ${x.detail}`));process.exit(1);}
console.log('ROUND13 NODE9 PASS: sitewide 404 / 5xx / resource error audit verified');
