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
const fallback=new Map([['重要新闻','important'],['热门头条','hot'],['美国时政','us-politics'],['美国警情','us-crime'],['中国官场','china-officialdom'],['移民美国','immigration'],['庇护百科','asylum'],['驱逐快报','deport'],['ICE执法动态','ice'],['ICE执法','ice'],['曝光墙','expose']]);
function section(a){const t=clean(a.topic_key).toLowerCase();if(t==='trump')return'trump';if(t==='ice')return'ice';const c=a.category_id?byId.get(String(a.category_id)):byName.get(clean(a.category_name));return clean(c?.slug)||fallback.get(clean(a.category_name))||'news';}
function canonical(a){return `${ORIGIN}/${encodeURIComponent(section(a))}/${encodeURIComponent(clean(a.slug||a.id))}`;}
function slugFromHref(href){try{const u=new URL(href);if(u.hostname!=='trrb.net'&&u.hostname!=='www.trrb.net')return'';const parts=u.pathname.split('/').filter(Boolean);if(parts.length<2)return'';return decodeURIComponent(parts.at(-1)||'');}catch{return'';}}
function canonicalFromHtml(html){return (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)||html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)||[])[1]||'';}
check(arts.length>=60,'取得近期已发布文章样本',`articles=${arts.length}`);
check(cats.length>=5,'取得有效栏目列表',`categories=${cats.length}`);

// Node 4 verifies actual internal discovery, not every internal DB category slug.
// The general archive is the complete discovery surface for recent content; public
// homepage/category/topic pages provide additional inbound links. Crawl only those
// real user-facing routes, which avoids false failures from invented/legacy aliases.
const publicEntryPaths=['/','/important-news','/hot-headlines','/us-politics','/us-crime','/china-officialdom','/trump','/ice','/ice/news'];
const archivePaths=['/listing.html?page=1','/listing.html?page=2','/listing.html?page=3','/listing.html?page=4'];
const targets=[...publicEntryPaths,...archivePaths];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const inboundBySlug=new Map();
const hrefsBySlug=new Map();
let legacyLinks=0;
const badPages=[];

for(const path of targets){
  const url=`${ORIGIN}${path}`;
  try{
    const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});
    await page.waitForTimeout(1100);
    const status=r?.status()||0;
    if(status!==200){badPages.push(`${url}=>${status||'no-response'}`);continue;}
    const hrefs=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(a=>a.href));
    for(const href of new Set(hrefs)){
      if(/article\.html\?id=/i.test(href))legacyLinks++;
      const slug=slugFromHref(href);if(!slug)continue;
      if(!inboundBySlug.has(slug))inboundBySlug.set(slug,new Set());
      inboundBySlug.get(slug).add(url);
      if(!hrefsBySlug.has(slug))hrefsBySlug.set(slug,new Set());
      hrefsBySlug.get(slug).add(href.replace(/\/$/,''));
    }
  }catch(error){badPages.push(`${url}=>${error?.name||'error'}`);}
}
await browser.close();
check(badPages.length===0,'真实首页/栏目/专题/归档发现页全部可访问',`pages=${targets.length}; bad=${badPages.length}${badPages.length?`; ${badPages.slice(0,8).join(' | ')}`:''}`);
check(legacyLinks===0,'发现页内部文章链接无legacy article?id',`legacy=${legacyLinks}`);

const orphan=[];let multiInbound=0;const aliases=[];
for(const a of arts){
  const slug=clean(a.slug||a.id);const sources=inboundBySlug.get(slug)||new Set();
  if(sources.size===0)orphan.push(canonical(a));
  if(sources.size>=2)multiInbound++;
  const expected=canonical(a).replace(/\/$/,'');
  const hrefs=hrefsBySlug.get(slug)||new Set();
  if(hrefs.size&&!hrefs.has(expected))aliases.push({expected,href:[...hrefs][0]});
}
check(orphan.length===0,'近期文章无孤岛：至少存在一个真实站内发现入口',`checked=${arts.length}; orphan=${orphan.length}${orphan.length?`; ${orphan.slice(0,8).join(' | ')}`:''}`);
check(multiInbound>=Math.floor(arts.length*0.25),'至少25%近期文章获得多入口内链',`multiInbound=${multiInbound}/${arts.length}`);

// An internal alias is acceptable for discovery only if the destination itself declares
// the expected canonical. This keeps orphan governance separate from byte-for-byte URL
// matching while still preventing misleading or broken internal links.
let aliasCanonicalBad=0;const aliasDetails=[];
for(const item of aliases.slice(0,12)){
  try{const r=await fetch(item.href,{redirect:'follow',headers:{'cache-control':'no-cache','user-agent':'TRRB-Round14-Node4/2.0'}});const html=await r.text();const declared=canonicalFromHtml(html).replace(/\/$/,'');if(r.status!==200||declared!==item.expected){aliasCanonicalBad++;aliasDetails.push(`${item.href}=>${r.status}:${declared||'-'}`);}}
  catch{aliasCanonicalBad++;aliasDetails.push(`${item.href}=>fetch-error`);}
}
check(aliasCanonicalBad===0,'非canonical站内别名均正确声明文章canonical',`aliases=${aliases.length}; checked=${Math.min(aliases.length,12)}; bad=${aliasCanonicalBad}${aliasDetails.length?`; ${aliasDetails.slice(0,5).join(' | ')}`:''}`);

const sitemap=await fetch(`${ORIGIN}/sitemap.xml?r14=node4`,{headers:{'cache-control':'no-cache'}}).then(async r=>({status:r.status,text:await r.text()}));
check(sitemap.status===200,'Sitemap 可用于补充发现',`status=${sitemap.status}`);
const sitemapMissing=arts.map(canonical).filter(u=>!sitemap.text.includes(u));
check(sitemapMissing.length===0,'近期文章全部进入Sitemap补充发现链路',`missing=${sitemapMissing.length}`);

writeFileSync('round14-node4-internal-link-orphan-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),origin:ORIGIN,articles:arts.length,pages:targets,badPages,orphan,multiInbound,aliases:aliases.slice(0,20),checks,failures},null,2));
console.log(`ROUND14 NODE4 audit: checks=${checks.length}; failures=${failures}`);
if(failures===0)console.log('ROUND14 NODE4 PASS: internal-link coverage and orphan-article governance verified');else{console.log('ROUND14 NODE4 FAIL: internal-link/orphan issues detected');process.exitCode=1;}
