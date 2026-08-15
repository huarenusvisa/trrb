import { writeFileSync, readFileSync } from 'node:fs';

const ORIGIN=(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/$/,'');
const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
const KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const H={apikey:KEY,Authorization:`Bearer ${KEY}`,Accept:'application/json'};
const checks=[]; let failures=0;
function check(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);}
async function dbArticles(limit=200){const u=new URL(`${SUPABASE_URL}/rest/v1/articles`);u.searchParams.set('select','id,title,slug,cover_image,status,published_at,created_at');u.searchParams.set('status','eq.published');u.searchParams.set('order','published_at.desc.nullslast,created_at.desc');u.searchParams.set('limit',String(limit));const r=await fetch(u,{headers:H});if(!r.ok)throw new Error(`articles ${r.status}`);return r.json();}
async function get(path){const r=await fetch(`${ORIGIN}${path}`,{headers:{'cache-control':'no-cache','user-agent':'Mozilla/5.0'}});return {status:r.status,text:await r.text(),headers:Object.fromEntries(r.headers.entries())};}

const articles=await dbArticles(200);
check(articles.length>=100,'取得近期已发布文章图片样本',`articles=${articles.length}`);
const covered=articles.filter(a=>String(a.cover_image||'').trim());
check(covered.length>=Math.floor(articles.length*0.95),'近期文章封面覆盖率>=95%',`covers=${covered.length}/${articles.length}`);
let badCover=0; let tested=0;
for(const a of covered.slice(0,30)){
  const raw=String(a.cover_image||'').trim();
  let url=raw;
  if(raw.startsWith('/')) url=`${ORIGIN}${raw}`;
  else if(!/^https?:\/\//i.test(raw)) url=`${ORIGIN}/${raw.replace(/^\.\//,'')}`;
  try{const r=await fetch(url,{method:'GET',headers:{Range:'bytes=0-32','user-agent':'Mozilla/5.0'}});tested++;if(!r.ok&&r.status!==206)badCover++;}catch{tested++;badCover++;}
}
check(tested>=20,'取得至少20张真实封面可达性样本',`tested=${tested}`);
check(badCover===0,'近期封面样本全部可访问',`bad=${badCover}/${tested}`);

const listingSource=readFileSync('listing.js','utf8');
check(/loading=["']lazy["']/i.test(listingSource),'栏目卡片图片启用 lazy-load');
check(/decoding=["']async["']/i.test(listingSource),'栏目卡片图片启用 async decoding');
check(/width=["']512["'][^>]+height=["']288["']/i.test(listingSource),'栏目卡片图片声明固定宽高避免布局抖动');
check(!/alt=["']["']/i.test(listingSource),'栏目卡片图片不存在空 alt');
check(/alt=["'][^"']*\$\{[^}]*title/i.test(listingSource)||/alt=\\?["'][^\n]*article\.title/i.test(listingSource),'栏目卡片图片 alt 绑定文章标题');
check(/onerror=/i.test(listingSource),'栏目卡片图片具备加载失败 fallback');

const common=readFileSync('site-common.js','utf8');
check(/CATEGORY_PLACEHOLDERS/.test(common)&&/installGlobalImageFallback/.test(common),'全站图片具备分类占位与错误容灾');
const optimizer=readFileSync('image-cdn-optimizer.js','utf8');
check(/loading/i.test(optimizer)||/lazy/i.test(optimizer),'图片优化器包含加载策略');

let livePages=0, liveImgs=0, missingAlt=0;
for(const path of ['/','/important-news','/hot-headlines','/us-politics','/us-crime','/china-officialdom']){
  const r=await get(path); if(r.status!==200)continue; livePages++;
  const imgs=[...r.text.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]); liveImgs+=imgs.length;
  for(const tag of imgs){if(!/\balt\s*=\s*["'][^"']+["']/i.test(tag))missingAlt++;}
}
check(livePages===6,'主要生产入口均可访问',`pages=${livePages}/6`);
check(liveImgs>=6,'生产入口存在图片资源',`images=${liveImgs}`);
check(missingAlt===0,'生产HTML图片均具备非空 alt',`missing=${missingAlt}/${liveImgs}`);

writeFileSync('round14-node6-image-seo-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),origin:ORIGIN,checks,failures},null,2));
console.log(`ROUND14 NODE6 audit: checks=${checks.length}; failures=${failures}`);
if(failures===0) console.log('ROUND14 NODE6 PASS: image SEO / Alt / Lazy-load completeness verified');
else {console.log('ROUND14 NODE6 FAIL: image SEO issues detected');process.exitCode=1;}
