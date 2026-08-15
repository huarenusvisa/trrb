#!/usr/bin/env node
import fs from 'node:fs';
const ORIGIN=String(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/+$/,'');const failures=[];const checks=[];
function record(ok,label,detail=''){checks.push({ok,label,detail});console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);if(!ok)failures.push({label,detail});}
async function req(path,method='GET'){const c=new AbortController();const t=setTimeout(()=>c.abort(),15000);try{return await fetch(`${ORIGIN}${path}${path.includes('?')?'&':'?'}node7=${Date.now()}`,{method,redirect:'follow',headers:{'cache-control':'no-cache','user-agent':'TRRB-Round13-Node7/1.0'},signal:c.signal});}finally{clearTimeout(t);}}
const config=fs.readFileSync('netlify.toml','utf8');
record(/\[build\][\s\S]*command\s*=/.test(config)&&/publish\s*=\s*"\."/.test(config),'Netlify build/publish 配置存在');
record(/node scripts\/validate-site\.mjs/.test(config)&&/node scripts\/seo-integrity-audit\.mjs/.test(config),'Netlify build 内置站点与SEO完整性阻断');
record(/Strict-Transport-Security/.test(config)&&/block-all-mixed-content/.test(config),'生产安全响应头已配置');
const paths=['/','/important-news','/hot','/us-politics','/us-crime','/china-officialdom','/trump','/ice','/ice/news','/sitemap.xml','/news-sitemap.xml','/feed.xml'];let bad=0;for(let round=1;round<=3;round++){for(const path of paths){try{const r=await req(path);if(r.status!==200)bad++;}catch{bad++;}}}record(bad===0,'核心生产入口连续3轮无非200/5xx',`bad=${bad}/${paths.length*3}`);
for(const asset of ['/styles.css','/site-common.js','/listing.js','/trrb-logo-cropped.webp']){const r=await req(asset,'HEAD');const cc=r.headers.get('cache-control')||'';const age=Number(cc.match(/max-age=(\d+)/i)?.[1]||0);record(r.status===200,`${asset} HTTP 200`,`status=${r.status}`);record(age>=600,`${asset} 静态缓存>=600秒`,cc);}
const html=await req('/listing.html','HEAD');record(html.status===200,'HTML生产入口 HTTP 200',`status=${html.status}`);record(/no-cache|no-store/.test(html.headers.get('cache-control')||''),'HTML保持短/禁缓存',html.headers.get('cache-control')||'');
const sitemap=await req('/sitemap.xml','HEAD');record(sitemap.headers.get('x-trrb-sitemap')==='live-supabase-v1','Edge Function 随生产部署可用',sitemap.headers.get('x-trrb-sitemap')||'missing');
console.log(`ROUND13 NODE7 audit: checks=${checks.length}; failures=${failures.length}`);if(failures.length){failures.forEach(x=>console.error(`FAIL ${x.label} — ${x.detail}`));process.exit(1);}console.log('ROUND13 NODE7 PASS: Netlify build and production deployment stability verified');
