import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const ORIGIN=(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/$/,'');
const SUPABASE_URL='https://fwiznbpsqkfgkvyznebz.supabase.co';
const KEY='sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak';
const H={apikey:KEY,Authorization:`Bearer ${KEY}`,Accept:'application/json'};
const checks=[];let failures=0;
function check(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);}
async function db(table,select,extra={}){const u=new URL(`${SUPABASE_URL}/rest/v1/${table}`);u.searchParams.set('select',select);for(const[k,v]of Object.entries(extra))u.searchParams.set(k,String(v));const r=await fetch(u,{headers:H});if(!r.ok)throw new Error(`${table} ${r.status}`);return r.json();}
const clean=v=>String(v||'').trim();
const cats=await db('categories','id,name,slug,is_active',{is_active:'eq.true',order:'sort_order.asc'});
const arts=await db('articles','id,title,slug,category_id,category_name,topic_key,status,published_at,created_at',{status:'eq.published',order:'published_at.desc.nullslast,created_at.desc',limit:'80'});
const byId=new Map(cats.map(c=>[String(c.id),c]));const byName=new Map(cats.map(c=>[clean(c.name),c]));
const fallback=new Map([['重要新闻','important-news'],['热门头条','hot-headlines'],['美国时政','us-politics'],['美国警情','us-crime'],['中国官场','china-officialdom'],['移民美国','immigration'],['庇护百科','asylum'],['驱逐快报','deport'],['ICE执法动态','ice'],['ICE执法','ice'],['曝光墙','expose']]);
function section(a){const t=clean(a.topic_key).toLowerCase();if(t==='trump')return'trump';if(t==='ice')return'ice';const c=a.category_id?byId.get(String(a.category_id)):byName.get(clean(a.category_name));return clean(c?.slug)||fallback.get(clean(a.category_name))||'news';}
function canonical(a){return `${ORIGIN}/${encodeURIComponent(section(a))}/${encodeURIComponent(clean(a.slug||a.id))}`;}
check(arts.length>=60,'取得近期已发布文章样本',`articles=${arts.length}`);
check(cats.length>=5,'取得有效栏目列表',`categories=${cats.length}`);

const paths=['/',...cats.map(c=>`/${encodeURIComponent(clean(c.slug))}`).filter(p=>p!=='/'),'/trump','/ice','/ice/news'];
const uniquePaths=[...new Set(paths)];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const inbound=new Map();let pageBad=0;let legacyLinks=0;let externalBad=0;
for(const path of uniquePaths){
  const url=`${ORIGIN}${path}`;
  try{
    const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
    await page.waitForTimeout(1800);
    if(!r||r.status()!==200){pageBad++;continue;}
    const hrefs=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(a=>a.href));
    for(const href of hrefs){
      if(/article\.html\?id=/i.test(href))legacyLinks++;
      try{const u=new URL(href);if(u.hostname&&u.hostname!=='trrb.net'&&u.hostname!=='www.trrb.net'&&href.startsWith('http'))continue;}catch{}
      const norm=href.replace(/\/$/,'');inbound.set(norm,(inbound.get(norm)||0)+1);
    }
  }catch{pageBad++;}
}
await browser.close();
check(pageBad===0,'首页/栏目/专题发现页全部可访问',`pages=${uniquePaths.length}; bad=${pageBad}`);
check(legacyLinks===0,'发现页内部文章链接无legacy article?id',`legacy=${legacyLinks}`);

const orphan=[];let multiInbound=0;
for(const a of arts){const u=canonical(a).replace(/\/$/,'');const count=inbound.get(u)||0;if(count===0)orphan.push(u);if(count>=2)multiInbound++;}
check(orphan.length===0,'近期文章无孤岛：均可从首页/栏目/专题发现',`checked=${arts.length}; orphan=${orphan.length}${orphan.length?`; ${orphan.slice(0,8).join(' | ')}`:''}`);
check(multiInbound>=Math.floor(arts.length*0.25),'至少25%近期文章获得多入口内链',`multiInbound=${multiInbound}/${arts.length}`);

const sitemap=await fetch(`${ORIGIN}/sitemap.xml`,{headers:{'cache-control':'no-cache'}}).then(async r=>({status:r.status,text:await r.text()}));
check(sitemap.status===200,'Sitemap 可用于补充发现',`status=${sitemap.status}`);
const sitemapMissing=arts.map(canonical).filter(u=>!sitemap.text.includes(u));
check(sitemapMissing.length===0,'近期文章全部进入Sitemap补充发现链路',`missing=${sitemapMissing.length}`);

writeFileSync('round14-node4-internal-link-orphan-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),origin:ORIGIN,articles:arts.length,pages:uniquePaths,orphan,checks,failures},null,2));
console.log(`ROUND14 NODE4 audit: checks=${checks.length}; failures=${failures}`);
if(failures===0)console.log('ROUND14 NODE4 PASS: internal-link coverage and orphan-article governance verified');else{console.log('ROUND14 NODE4 FAIL: internal-link/orphan issues detected');process.exitCode=1;}
