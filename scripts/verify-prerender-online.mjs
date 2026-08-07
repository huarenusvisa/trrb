#!/usr/bin/env node
const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const SAMPLE = Math.max(3, Math.min(20, Number(process.env.PRERENDER_SAMPLE || 8)));
const UA_GOOGLE = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36';

function decodeXml(v=''){return String(v).replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'");}
function allLocs(xml){return [...String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(m=>decodeXml(m[1].trim())).filter(Boolean);}
function articleLocs(xml){return allLocs(xml).filter(u=>u.startsWith(`${ORIGIN}/article.html?id=`));}
function textMatch(html,re){const m=html.match(re);return m?String(m[1]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim():'';}
async function get(url, ua){return fetch(url,{redirect:'follow',headers:{'user-agent':ua,'accept':'text/html,application/xhtml+xml'}});}

async function collectArticleUrls(){
  const queue=[`${ORIGIN}/sitemap.xml`,`${ORIGIN}/news-sitemap.xml`];
  const seen=new Set();
  const articles=new Set();
  while(queue.length && seen.size<20 && articles.size<SAMPLE){
    const url=queue.shift();
    if(seen.has(url)) continue;
    seen.add(url);
    let res;
    try{res=await fetch(url,{redirect:'follow',headers:{'user-agent':UA_GOOGLE,'accept':'application/xml,text/xml,*/*'}});}catch{continue;}
    if(!res.ok) continue;
    const xml=await res.text();
    for(const a of articleLocs(xml)) articles.add(a);
    for(const loc of allLocs(xml)){
      if(articles.size>=SAMPLE) break;
      try{
        const u=new URL(loc);
        if(u.hostname!=='trrb.net') continue;
        if(/\.xml(?:$|\?)/i.test(u.pathname+u.search) || /sitemap/i.test(u.pathname)) queue.push(loc);
      }catch{}
    }
  }
  return {urls:[...articles].slice(0,SAMPLE),seen:[...seen]};
}

const failures=[];
const details=[];
const collected=await collectArticleUrls();
const urls=collected.urls;
if(urls.length<3){
  throw new Error(`sitemap article sample too small: ${urls.length}; checked: ${collected.seen.join(', ')}`);
}

for(const url of urls){
  for(const [agent,ua] of [['googlebot',UA_GOOGLE],['browser',UA_BROWSER]]){
    const res=await get(url,ua);
    const html=await res.text();
    const canonical=textMatch(html,/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || textMatch(html,/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    const title=textMatch(html,/<title>([\s\S]*?)<\/title>/i);
    const h1=textMatch(html,/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const paragraphs=(html.match(/<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>[\s\S]*?<\/div>/i)?.[0].match(/<p\b/gi)||[]).length;
    const hasMarker=/data-prerendered=["']true["']/i.test(html);
    const hasSchema=/application\/ld\+json/i.test(html)&&/NewsArticle/.test(html);
    const prerenderHeader=res.headers.get('x-trrb-prerender')||'';
    const checks={status:res.status===200,host:new URL(res.url).hostname==='trrb.net',marker:hasMarker,header:prerenderHeader==='article-edge-v1',title:title.length>8&&!/Tang Ren Daily\s*$/.test(title),h1:h1.length>4,body:paragraphs>0,canonical:canonical===url,schema:hasSchema};
    const bad=Object.entries(checks).filter(([,ok])=>!ok).map(([k])=>k);
    details.push({url,agent,status:res.status,canonical,title,h1,paragraphs,prerenderHeader,bad});
    if(bad.length) failures.push({url,agent,bad});
  }
}

const invalid=`${ORIGIN}/article.html?id=00000000-0000-4000-8000-000000000000`;
const badRes=await get(invalid,UA_GOOGLE);
const badHtml=await badRes.text();
const invalidOk=badRes.status===404 && (/noindex/i.test(badRes.headers.get('x-robots-tag')||'') || /name=["']robots["'][^>]+noindex/i.test(badHtml));
if(!invalidOk) failures.push({url:invalid,agent:'googlebot',bad:['invalid-url-not-404-noindex'],status:badRes.status});

const report={generated_at:new Date().toISOString(),origin:ORIGIN,sample:urls.length,sitemaps_checked:collected.seen,failures,details,invalid:{url:invalid,status:badRes.status,xRobots:badRes.headers.get('x-robots-tag')||'',ok:invalidOk}};
await import('node:fs').then(fs=>fs.writeFileSync('prerender-online-report.json',JSON.stringify(report,null,2)));
console.log(`预渲染线上验证：${urls.length}篇 × 2种UA；失败 ${failures.length}`);
if(failures.length){console.error(JSON.stringify(failures,null,2));process.exit(1);} 
