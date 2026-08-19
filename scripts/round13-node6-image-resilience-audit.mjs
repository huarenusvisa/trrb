#!/usr/bin/env node
import fs from 'node:fs';
const ORIGIN=String(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/+$/,'');
const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';const KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';const H={apikey:KEY,Authorization:`Bearer ${KEY}`,Accept:'application/json'};
const checks=[];const failures=[];function record(ok,label,detail=''){checks.push({ok,label,detail});console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);if(!ok)failures.push({label,detail});}
async function db(params){const u=new URL(`${SUPABASE_URL}/rest/v1/articles`);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));const r=await fetch(u,{headers:H,cache:'no-store'});if(!r.ok)throw new Error(`articles ${r.status}`);return r.json();}
async function reachable(url){const c=new AbortController();const t=setTimeout(()=>c.abort(),12000);try{const r=await fetch(url,{redirect:'follow',signal:c.signal,headers:{Range:'bytes=0-2048','user-agent':'TRRB-Round13-Node6/2.0'}});return {ok:r.status>=200&&r.status<400,status:r.status,type:r.headers.get('content-type')||''};}catch(e){return{ok:false,status:0,type:'',error:String(e.message||e)}}finally{clearTimeout(t);}}
const admin=fs.readFileSync('admin/admin.js','utf8');
record(/ARTICLE_IMAGE_BUCKET\s*=\s*"article-images"/.test(admin),'后台封面上传使用专用 article-images Bucket');
record(/file\?\.type\?\.startsWith\("image\/"\)/.test(admin)&&/file\.size\s*>\s*MAX_SOURCE_IMAGE_BYTES/.test(admin),'上传前校验图片类型和大小');
record(/optimizeImage\(file,\s*1600,\s*0\.84\)/.test(admin)&&/contentType:\s*"image\/webp"/.test(admin),'封面上传前自动压缩并转 WebP');
record(/upsert:\s*false/.test(admin)&&/图片上传失败/.test(admin)&&/无法取得公开地址/.test(admin),'上传失败明确中止且避免静默覆盖');
record(/auto-ai-cover/.test(admin)&&/generateAiCover\(\{\s*silent:\s*true\s*\}\)/.test(admin),'发布无封面时支持自动生成封面');
const listing=fs.readFileSync('listing.js','utf8');const home=fs.readFileSync('homepage-refresh-guard.js','utf8');const globalImages=fs.readFileSync('image-cdn-optimizer.js','utf8');const articleTemplate=fs.readFileSync('article.html','utf8');
record(/onerror=.*fallback/i.test(listing),'栏目卡片图片失败自动切换 fallback');
record(/TRRB_categoryPlaceholder|image-placeholder\.svg/.test(listing),'栏目图片具备分类/通用占位图');
record(/addEventListener\("error"/.test(home)&&/trrbRetried/.test(home),'首页图片失败自动重试一次');
record(/function useFallback\(/.test(globalImages)&&/addEventListener\("error"/.test(globalImages)&&/TRRB_categoryPlaceholder|category-placeholders/.test(globalImages),'全局图片系统对加载失败切换分类占位图');
record(/img\.complete[\s\S]{0,180}useFallback\(img\)/.test(globalImages),'全局图片系统覆盖初始已失败图片');
record(/image-cdn-optimizer\.js/.test(articleTemplate),'当前文章模板加载全局图片容灾系统');
const p=await reachable(`${ORIGIN}/image-placeholder.svg?node6=${Date.now()}`);record(p.ok,'通用图片占位资源生产可访问',`status=${p.status}; type=${p.type}`);
const rows=await db({select:'id,title,cover_image,status,published_at,created_at',status:'eq.published',order:'published_at.desc.nullslast,created_at.desc',limit:'200'});const covers=rows.filter(x=>String(x.cover_image||'').trim());record(covers.length>0,'近期已发布文章存在封面样本',`covers=${covers.length}/${rows.length}`);
const owned=covers.map(x=>String(x.cover_image).trim()).filter(u=>{try{const h=new URL(u,ORIGIN).hostname;return h==='trrb.net'||h.endsWith('.supabase.co');}catch{return false}}).slice(0,20);record(owned.length>0,'取得自有/存储封面可达性样本',`samples=${owned.length}`);
let bad=0;for(const url of owned){const r=await reachable(url.startsWith('/')?ORIGIN+url:url);if(!r.ok)bad++;}record(bad===0,'自有/存储封面样本全部可访问',`bad=${bad}/${owned.length}`);
console.log(`ROUND13 NODE6 audit: checks=${checks.length}; failures=${failures.length}`);if(failures.length){failures.forEach(x=>console.error(`FAIL ${x.label} — ${x.detail}`));process.exit(1);}console.log('ROUND13 NODE6 PASS: current image upload and global cover failover resilience verified');
