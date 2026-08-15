import { chromium } from 'playwright';
import fs from 'node:fs';
const ORIGIN=process.env.SITE_ORIGIN||'https://trrb.net';
const checks=[];
const check=(name,ok,detail='')=>{checks.push({name,ok:Boolean(ok),detail});console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` — ${detail}`:''}`)};
const fetchNoCache=u=>fetch(`${u}${u.includes('?')?'&':'?'}node9=${Date.now()}`,{headers:{'cache-control':'no-cache'}});
const dbRes=await fetchNoCache(`${ORIGIN}/data/legal/unified-legal-authorities-latest.json`);
check('production unified legal database reachable',dbRes.ok,`HTTP ${dbRes.status}`);
if(!dbRes.ok)process.exit(1);
const db=await dbRes.json();const records=Array.isArray(db.records)?db.records:[];
const hubRes=await fetchNoCache(`${ORIGIN}/legal/`);const hubHtml=await hubRes.text();
check('legal hub production HTTP 200',hubRes.ok,`HTTP ${hubRes.status}`);
check('legal hub canonical is stable',/rel=["']canonical["'][^>]+href=["']https:\/\/trrb\.net\/legal\/["']/.test(hubHtml));
check('legal hub is indexable',/<meta[^>]+name=["']robots["'][^>]+content=["']index,follow["']/.test(hubHtml));
check('legal hub has descriptive metadata',/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{40,}["']/.test(hubHtml));
const smRes=await fetchNoCache(`${ORIGIN}/sitemap-legal.xml`);const sm=await smRes.text();
const locs=[...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replace(/&amp;/g,'&'));
check('legal sitemap production HTTP 200',smRes.ok,`HTTP ${smRes.status}`);
check('legal sitemap contains hub plus every current legal record',locs.length===records.length+1,`sitemap=${locs.length} expected=${records.length+1}`);
check('legal sitemap contains canonical hub URL',locs.includes(`${ORIGIN}/legal/`));
const sources=['SCOTUS','US_CIRCUIT','BIA','WHITE_HOUSE','FEDERAL_REGISTER'];
const samples=sources.map(s=>records.find(r=>r.sourceSystem===s&&r.id&&r.officialUrl)).filter(Boolean);
check('five-source SEO samples available',samples.length===5,`samples=${samples.length}`);
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});
for(const r of samples){
 const canonical=`${ORIGIN}/legal/detail.html?id=${encodeURIComponent(r.id)}`;
 check(`${r.sourceSystem} canonical detail is in legal sitemap`,locs.includes(canonical),r.id);
 await page.goto(`${canonical}&node9=${Date.now()}`,{waitUntil:'networkidle',timeout:45000});
 const can=await page.locator('link[rel="canonical"]').getAttribute('href').catch(()=>null);
 const desc=await page.locator('meta[name="description"]').getAttribute('content').catch(()=>null);
 const title=await page.title();
 const jsonText=await page.locator('#legal-detail-jsonld').textContent().catch(()=>'');
 let schema=null;try{schema=JSON.parse(jsonText||'null')}catch{}
 check(`${r.sourceSystem} dynamic canonical matches record`,can===canonical,can||'missing');
 check(`${r.sourceSystem} detail title is record-specific`,Boolean(title)&&!title.startsWith('美国判例与新规详情'),title.slice(0,100));
 check(`${r.sourceSystem} detail meta description is record-specific`,Boolean(desc)&&desc.length>=20,desc?.slice(0,100)||'missing');
 check(`${r.sourceSystem} WebPage structured data exists`,schema?.['@type']==='WebPage');
 check(`${r.sourceSystem} legal mainEntity structured data exists`,schema?.mainEntity?.['@type']==='Legislation');
 check(`${r.sourceSystem} structured canonical URL matches`,schema?.url===canonical,schema?.url||'missing');
 const schemas=await page.locator('script[type="application/ld+json"]').allTextContents();
 check(`${r.sourceSystem} legal detail does not masquerade as NewsArticle`,!schemas.some(x=>/"@type"\s*:\s*"NewsArticle"/.test(x)));
}
await browser.close();
const failures=checks.filter(c=>!c.ok);const report={generatedAt:new Date().toISOString(),origin:ORIGIN,datasetVersion:db.datasetVersion,count:records.length,sitemapCount:locs.length,checks,failures:failures.length};
fs.writeFileSync('round16-node9-legal-seo-sitemap-schema.json',JSON.stringify(report,null,2));
console.log(`ROUND16 NODE9 audit: checks=${checks.length}; failures=${failures.length}; records=${records.length}`);
if(failures.length){console.error('ROUND16 NODE9 FAIL: SEO/Sitemap/structured-data gaps remain');process.exit(1)}
console.log('ROUND16 NODE9 PASS: legal SEO, Sitemap and structured data integrity verified in production');
