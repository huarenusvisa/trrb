#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ORIGIN=String(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/+$/,'');
const checks=[];const failures=[];
function record(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);if(!ok)failures.push({label,detail});}
async function req(pathname){const r=await fetch(`${ORIGIN}${pathname}${pathname.includes('?')?'&':'?'}r14n9=${Date.now()}`,{redirect:'manual',headers:{'cache-control':'no-cache'}});return{status:r.status,headers:Object.fromEntries(r.headers.entries()),text:await r.text()};}

for(const pathname of ['/','/important-news','/hot-headlines','/us-politics','/ice']){
  const r=await req(pathname);
  record(r.status===200,`${pathname} HTTP 200`,`status=${r.status}`);
  const h=r.headers;
  record(/max-age=\d+/.test(h['strict-transport-security']||''),`${pathname} HSTS存在`,h['strict-transport-security']||'missing');
  record((h['x-content-type-options']||'').toLowerCase()==='nosniff',`${pathname} nosniff存在`,h['x-content-type-options']||'missing');
  record(Boolean(h['content-security-policy']),`${pathname} CSP存在`,h['content-security-policy']||'missing');
  record(Boolean(h['referrer-policy']),`${pathname} Referrer-Policy存在`,h['referrer-policy']||'missing');
  record(Boolean(h['permissions-policy']),`${pathname} Permissions-Policy存在`,h['permissions-policy']||'missing');
  record(Boolean(h['x-frame-options'])||/frame-ancestors/i.test(h['content-security-policy']||''),`${pathname} 点击劫持防护存在`,h['x-frame-options']||h['content-security-policy']||'missing');
}

// Repository root is the Netlify publish directory. These are source/control
// artifacts, not website content, so they must be denied even if they exist in
// the Git working tree.
const blockedPublicPaths=[
  '/netlify.toml',
  '/.github/workflows/round14-node7-core-web-vitals.yml',
  '/scripts/round14-node7-core-web-vitals-audit.mjs',
  '/netlify/edge-functions/article-prerender.ts',
  '/netlify/functions/public-home-bundle.js',
  '/SUPABASE-ICE-MULTISOURCE.sql',
  '/README-ICE-SNAPSHOT-V2.md',
  '/FIX-REPORT-v29.7.txt',
  '/docs/ROUND17-LEGAL-KNOWLEDGE-SEARCH-AND-RELIABILITY.md',
  '/.env',
  '/.git/config'
];
for(const pathname of blockedPublicPaths){
  const r=await req(pathname);
  record([404,410].includes(r.status),`${pathname} 不对公网暴露`,`status=${r.status}; marker=${r.headers['x-trrb-internal-source-block']||'none'}`);
}

// Verify the source blocker does not break intentional public data/routes.
for(const pathname of ['/robots.txt','/data/legal/unified-legal-authorities-latest.json','/config/immigration-knowledge.js']){
  const r=await req(pathname);
  record(r.status===200,`${pathname} 仍保持公开可访问`,`status=${r.status}`);
}
const verification=await req('/08665bdb2ead4dcf7d8e6afc895c07d7.txt');
record(verification.status===200,'搜索引擎验证TXT未被内部源码守卫误封',`status=${verification.status}`);

const sensitivePatterns=[
  {name:'Supabase service-role assignment',re:/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'`][A-Za-z0-9._-]{20,}["'`]/i},
  {name:'Supabase secret key',re:/sb_secret_[A-Za-z0-9._-]{20,}/i},
  {name:'OpenAI secret key',re:/sk-(?:proj-)?[A-Za-z0-9_-]{30,}/},
  {name:'Netlify auth token assignment',re:/NETLIFY_AUTH_TOKEN\s*[:=]\s*["'`][A-Za-z0-9._-]{20,}["'`]/i},
  {name:'Private key block',re:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/},
  {name:'Literal password',re:/(?:password|passwd)\s*[:=]\s*["'`][^"'`]{8,}["'`]/i}
];

const IGNORE_DIRS=new Set(['.git','node_modules']);
const SCAN_EXTENSIONS=new Set(['.html','.js','.mjs','.cjs','.ts','.tsx','.json','.toml','.yml','.yaml','.txt','.md','.sql']);
const MAX_FILE=2*1024*1024;
const secretHits=[];
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(IGNORE_DIRS.has(entry.name))continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()){walk(full);continue;}
    if(!SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))continue;
    let stat;try{stat=fs.statSync(full)}catch{continue}
    if(stat.size>MAX_FILE)continue;
    let text='';try{text=fs.readFileSync(full,'utf8')}catch{continue}
    for(const item of sensitivePatterns){
      if(item.re.test(text))secretHits.push(`${full}:${item.name}`);
    }
  }
}
walk('.');
record(secretHits.length===0,'仓库文本文件未发现高风险私密凭据字面值',`hits=${secretHits.length}${secretHits.length?`; ${secretHits.slice(0,5).join(' | ')}`:''}`);

record(!fs.existsSync('package-lock.json')&&!fs.existsSync('package.json'),'生产仓库无Node运行时依赖清单，避免未管理依赖进入静态发布面',`package.json=${fs.existsSync('package.json')}; lock=${fs.existsSync('package-lock.json')}`);

fs.writeFileSync('round14-node9-security-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),origin:ORIGIN,checks,failures,blockedPublicPaths,secretHits},null,2)+'\n');
console.log(`ROUND14 NODE9 audit: checks=${checks.length}; failures=${failures.length}`);
if(failures.length){console.log('ROUND14 NODE9 FAIL: security header / source exposure / credential issue detected');process.exit(1);}
console.log('ROUND14 NODE9 PASS: security headers, internal source blocking and secret exposure verified');
