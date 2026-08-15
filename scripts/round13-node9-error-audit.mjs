#!/usr/bin/env node
import fs from 'node:fs';

const ORIGIN=String(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/+$/,'');
const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
const KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const H={apikey:KEY,Authorization:`Bearer ${KEY}`,Accept:'application/json'};
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const failures=[];const checks=[];
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

function record(ok,label,detail=''){
  checks.push({ok,label,detail});
  console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);
  if(!ok)failures.push({label,detail});
}
async function dbAll(table,select,extra={}){
  const out=[];
  for(let offset=0;;offset+=1000){
    const u=new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    u.searchParams.set('select',select);
    Object.entries(extra).forEach(([k,v])=>u.searchParams.set(k,String(v)));
    u.searchParams.set('limit','1000');u.searchParams.set('offset',String(offset));
    const r=await fetch(u,{headers:H});
    if(!r.ok)throw new Error(`${table} ${r.status}`);
    const rows=await r.json();out.push(...rows);if(rows.length<1000)break;
  }
  return out;
}
const clean=v=>String(v||'').trim();
const cats=await dbAll('categories','id,name,slug,is_active',{is_active:'eq.true'});
const arts=await dbAll('articles','id,title,slug,category_id,category_name,topic_key,status,published_at,created_at',{status:'eq.published',order:'published_at.desc.nullslast,created_at.desc'});
const byId=new Map(cats.map(x=>[String(x.id||''),x]));
const byName=new Map(cats.map(x=>[clean(x.name),x]));
const fallback=new Map([
  ['重要新闻','important-news'],['热门头条','hot-headlines'],['美国时政','us-politics'],['美国警情','us-crime'],
  ['中国官场','china-officialdom'],['移民美国','immigration'],['庇护百科','asylum'],['驱逐快报','deport'],
  ['ICE执法动态','ice'],['ICE执法','ice'],['曝光墙','expose']
]);
function section(a){
  const t=clean(a.topic_key).toLowerCase();
  if(t==='trump')return'trump';if(t==='ice')return'ice';
  const c=byId.get(String(a.category_id||''))||byName.get(clean(a.category_name));
  return clean(c?.slug)||fallback.get(clean(a.category_name))||'news';
}
function canonical(a){return `${ORIGIN}/${encodeURIComponent(section(a))}/${encodeURIComponent(clean(a.slug||a.id))}`;}
record(arts.length>3000,'加载完整已发布文章库',`published=${arts.length}`);
record(cats.length>=5,'加载有效栏目配置',`categories=${cats.length}`);

async function requestStatus(url,{method='GET',redirect='follow',retry=true}={}){
  const attempt=async(methodName,extraHeaders={})=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const r=await fetch(url,{method:methodName,redirect,headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8','accept-language':'zh-CN,zh;q=0.9,en;q=0.7',...extraHeaders},signal:controller.signal});
      if(r.body) await r.body.cancel().catch(()=>{});
      return r;
    } finally {clearTimeout(timer);}
  };
  let r=await attempt(method);
  if(retry&&(r.status===403||r.status===429)){
    await sleep(700+Math.floor(Math.random()*500));
    r=await attempt('GET',{'cache-control':'max-age=0'});
  }
  return r;
}

const staticCore=['/','/trump','/ice','/ice/news','/listing.html','/sitemap.xml','/news-sitemap.xml','/feed.xml','/styles.css','/site-common.js','/listing.js','/article.js','/trrb-logo-cropped.webp','/image-placeholder.svg'];
const categoryCore=cats.map(c=>clean(c.slug)).filter(Boolean).map(slug=>`/${encodeURIComponent(slug)}`);
const core=[...new Set([...staticCore,...categoryCore])];
const coreBad=[];
for(const p of core){
  try{
    const r=await requestStatus(`${ORIGIN}${p}`,{method:'GET'});
    if(r.status!==200)coreBad.push(`${r.status} ${p}`);
  }catch(e){coreBad.push(`ERR ${p} ${e.message||e}`);}
}
record(coreBad.length===0,'核心页面/资源无404或5xx',`checked=${core.length}${coreBad.length?`; ${coreBad.slice(0,30).join(' | ')}`:''}`);

const urls=[...new Set(arts.map(canonical))];
let cursor=0;const bad=[];let recovered=0;const concurrency=8;
const workers=Array.from({length:concurrency},async()=>{
  while(true){
    const i=cursor++;if(i>=urls.length)break;
    const url=urls[i];
    try{
      let r=await requestStatus(url,{method:'GET',retry:false});
      if(r.status===403||r.status===429){
        await sleep(850+Math.floor(Math.random()*650));
        const retry=await requestStatus(url,{method:'GET',retry:false});
        if(retry.status===200)recovered++;
        r=retry;
      }
      if(r.status!==200)bad.push(`${r.status} ${url}`);
    }catch(e){
      await sleep(1000);
      try{
        const retry=await requestStatus(url,{method:'GET',retry:false});
        if(retry.status===200)recovered++; else bad.push(`${retry.status} ${url}`);
      }catch(e2){bad.push(`ERR ${url} ${e2.message||e2}`);}
    }
    if(i%50===0)await sleep(120);
  }
});
await Promise.all(workers);
record(bad.length===0,'全量已发布文章canonical无404/5xx',`checked=${urls.length}; recovered_after_backoff=${recovered}; bad=${bad.length}${bad.length?`; ${bad.slice(0,20).join(' | ')}`:''}`);

const legacySamples=arts.slice(0,100);const legacyBad=[];
for(const a of legacySamples){
  try{
    const r=await requestStatus(`${ORIGIN}/article.html?id=${encodeURIComponent(a.id)}`,{method:'HEAD',redirect:'manual'});
    if(r.status!==301&&r.status!==308)legacyBad.push(`${r.status} ${a.id}`);
  }catch(e){legacyBad.push(`ERR ${a.id}`);}
}
record(legacyBad.length===0,'最近100篇legacy链接均一跳重定向',legacyBad.slice(0,20).join(' | '));

fs.writeFileSync('round13-node9-error-audit.json',JSON.stringify({generated_at:new Date().toISOString(),origin:ORIGIN,published:arts.length,canonical_count:urls.length,recovered_after_backoff:recovered,failures,checks,bad_urls:bad},null,2)+'\n');
console.log(`ROUND13 NODE9 audit: checks=${checks.length}; failures=${failures.length}`);
if(failures.length){failures.forEach(x=>console.error(`FAIL ${x.label} — ${x.detail}`));process.exit(1);}
console.log('ROUND13 NODE9 PASS: sitewide 404 / 5xx / resource error audit verified');
