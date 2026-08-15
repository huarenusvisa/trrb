#!/usr/bin/env node
import fs from 'node:fs';

const ORIGIN=String(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/+$/,'');
const checks=[];const failures=[];
function record(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);if(!ok)failures.push({label,detail});}
async function req(path){const r=await fetch(`${ORIGIN}${path}${path.includes('?')?'&':'?'}r14n9=${Date.now()}`,{redirect:'manual',headers:{'cache-control':'no-cache'}});return{status:r.status,headers:Object.fromEntries(r.headers.entries()),text:await r.text()};}

for(const path of ['/','/important-news','/hot-headlines','/us-politics','/ice']){
  const r=await req(path);
  record(r.status===200,`${path} HTTP 200`,`status=${r.status}`);
  const h=r.headers;
  record(/max-age=\d+/.test(h['strict-transport-security']||''),`${path} HSTS存在`,h['strict-transport-security']||'missing');
  record((h['x-content-type-options']||'').toLowerCase()==='nosniff',`${path} nosniff存在`,h['x-content-type-options']||'missing');
  record(Boolean(h['content-security-policy']),`${path} CSP存在`,h['content-security-policy']||'missing');
  record(Boolean(h['referrer-policy']),`${path} Referrer-Policy存在`,h['referrer-policy']||'missing');
  record(Boolean(h['permissions-policy']),`${path} Permissions-Policy存在`,h['permissions-policy']||'missing');
  record(Boolean(h['x-frame-options'])||/frame-ancestors/i.test(h['content-security-policy']||''),`${path} 点击劫持防护存在`,h['x-frame-options']||h['content-security-policy']||'missing');
}

for(const path of ['/netlify.toml','/.github/workflows/round14-node7-core-web-vitals.yml','/scripts/round14-node7-core-web-vitals-audit.mjs','/netlify/edge-functions/article-prerender.ts','/.env','/.git/config']){
  const r=await req(path);
  record([404,410].includes(r.status),`${path} 不对公网暴露`,`status=${r.status}`);
}

const sensitivePatterns=[
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'`]?[A-Za-z0-9._-]{20,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:password|passwd)\s*[:=]\s*["'`][^"'`]{8,}["'`]/i,
  /sk-[A-Za-z0-9_-]{20,}/
];
const candidates=['netlify.toml','_headers','_redirects','listing.js','site-common.js','article-route-runtime.js'];
let secretHits=[];
for(const file of candidates){
  if(!fs.existsSync(file))continue;
  const text=fs.readFileSync(file,'utf8');
  for(const re of sensitivePatterns){if(re.test(text))secretHits.push(`${file}:${re}`);}
}
record(secretHits.length===0,'核心公开源文件未发现高风险私密凭据',`hits=${secretHits.length}`);
record(!fs.existsSync('package-lock.json')&&!fs.existsSync('package.json'),'生产仓库无Node运行时依赖清单，避免未管理依赖进入静态发布面',`package.json=${fs.existsSync('package.json')}; lock=${fs.existsSync('package-lock.json')}`);

fs.writeFileSync('round14-node9-security-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),origin:ORIGIN,checks,failures,secretHits},null,2)+'\n');
console.log(`ROUND14 NODE9 audit: checks=${checks.length}; failures=${failures.length}`);
if(failures.length){console.log('ROUND14 NODE9 FAIL: security header / dependency / sensitive exposure issue detected');process.exit(1);}
console.log('ROUND14 NODE9 PASS: security headers / dependencies / sensitive-file exposure verified');
