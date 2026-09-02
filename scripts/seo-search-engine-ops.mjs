import fs from 'node:fs/promises';
import process from 'node:process';
import { google } from 'googleapis';

const SITE_ORIGIN=(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/$/,'');
const GSC_SITE_URL=process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL||'sc-domain:trrb.net';
const GSC_JSON=process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON||'';
const BING_KEY=process.env.BING_WEBMASTER_API_KEY||'';
const WRITE_MODE=/^(1|true|yes)$/i.test(process.env.SEO_WRITE_MODE||'false');
const REQUIRE_GOOGLE=/^(1|true|yes)$/i.test(process.env.SEO_REQUIRE_GOOGLE||'false');
const REQUIRE_BING=/^(1|true|yes)$/i.test(process.env.SEO_REQUIRE_BING||'false');
const LIVE_AUDIT_LIMIT=Math.max(10,Math.min(500,Number(process.env.SEO_LIVE_AUDIT_LIMIT||120)));
const report={generatedAt:new Date().toISOString(),site:SITE_ORIGIN,writeMode:WRITE_MODE,google:{configured:false},bing:{configured:false},local:{},warnings:[],failures:[]};

async function fetchText(url){const r=await fetch(url,{headers:{'user-agent':'TRRB-SEO-Ops/2.0','cache-control':'no-cache'}});return{status:r.status,url:r.url,text:await r.text(),headers:Object.fromEntries(r.headers.entries())};}
function locs(xml){return[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replace(/&amp;/g,'&').trim());}
function cleanText(value){return String(value||'').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp|quot|#39);/gi,' ').replace(/\s+/g,' ').trim();}
function tagText(html,tag){const m=String(html||'').match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i'));return cleanText(m?.[1]||'');}
function metaDescription(html){const tags=String(html||'').match(/<meta\b[^>]*>/gi)||[];for(const tag of tags){if(!/\bname\s*=\s*["']description["']/i.test(tag))continue;const m=tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);if(m)return cleanText(m[1]);}return'';}
async function mapLimit(items,limit,fn){const out=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i);}}));return out;}
async function livePageAudit(){
  const sitemap=await fetchText(`${SITE_ORIGIN}/sitemap.xml?seoops=live-audit-${Date.now()}`);
  if(sitemap.status!==200)throw new Error(`live sitemap HTTP ${sitemap.status}`);
  const urls=[...new Set(locs(sitemap.text).filter(u=>u.startsWith(`${SITE_ORIGIN}/`)))].slice(0,LIVE_AUDIT_LIMIT);
  const pages=await mapLimit(urls,3,async url=>{
    try{
      let r=await fetchText(url);
      if(r.status===403||r.status===429){await new Promise(resolve=>setTimeout(resolve,1200));r=await fetchText(url);}
      await new Promise(resolve=>setTimeout(resolve,180));
      const title=tagText(r.text,'title');const description=metaDescription(r.text);const h1=tagText(r.text,'h1');
      const images=r.text.match(/<img\b[^>]*>/gi)||[];const missingAlt=images.filter(tag=>!/(?:^|\s)alt\s*=\s*["'][^"']*["']/i.test(tag)).length;
      const issues=[];if(r.status!==200)issues.push(`HTTP ${r.status}`);if(title.length<8)issues.push('title missing/short');if(description.length<40)issues.push('description missing/short');if(!h1)issues.push('H1 missing');if(missingAlt)issues.push(`${missingAlt} image(s) missing alt`);
      return{url,status:r.status,title,description,h1,missingAlt,issues};
    }catch(e){return{url,status:0,title:'',description:'',h1:'',missingAlt:0,issues:[e.message]};}
  });
  const seenTitles=new Map(),seenDescriptions=new Map();
  for(const page of pages){
    if(page.status===200&&page.title){const prev=seenTitles.get(page.title);if(prev){page.issues.push('duplicate title');prev.issues.push('duplicate title');}else seenTitles.set(page.title,page);}
    if(page.status===200&&page.description){const prev=seenDescriptions.get(page.description);if(prev){page.issues.push('duplicate description');prev.issues.push('duplicate description');}else seenDescriptions.set(page.description,page);}
  }
  const bad=pages.filter(page=>page.issues.length);
  report.local.livePages={sampled:pages.length,passed:pages.length-bad.length,failed:bad.length,issues:bad.slice(0,100).map(({url,status,issues})=>({url,status,issues}))};
  if(bad.length)report.failures.push(`Live indexable page SEO audit failed: ${bad.length}/${pages.length}`);
  return pages.filter(page=>!page.issues.length).map(page=>page.url);
}

async function localAudit(){
  for(const p of ['/robots.txt','/sitemap.xml','/news-sitemap.xml','/sitemap-legal.xml']){
    try{const r=await fetchText(`${SITE_ORIGIN}${p}?seoops=${Date.now()}`);report.local[p]={status:r.status,bytes:r.text.length};if(r.status!==200)report.failures.push(`${p} HTTP ${r.status}`)}catch(e){report.failures.push(`${p} ${e.message}`)}
  }
  try{report.local.submissionCandidates=await livePageAudit();}catch(e){report.failures.push(`Live page audit: ${e.message}`);report.local.submissionCandidates=[];}
}

async function googleOps(){
  if(!GSC_JSON){report.google.reason='missing GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON';return;}
  let creds;try{creds=JSON.parse(GSC_JSON);report.google.serviceAccountEmail=creds.client_email||null;}catch{report.failures.push('Google service account JSON is invalid');return;}
  const auth=new google.auth.GoogleAuth({credentials:creds,scopes:[WRITE_MODE?'https://www.googleapis.com/auth/webmasters':'https://www.googleapis.com/auth/webmasters.readonly']});
  const webmasters=google.webmasters({version:'v3',auth});
  const searchconsole=google.searchconsole({version:'v1',auth});
  report.google.configured=true;report.google.siteUrl=GSC_SITE_URL;
  try{
    const site=await webmasters.sites.get({siteUrl:GSC_SITE_URL});
    report.google.permissionLevel=site.data.permissionLevel||null;
    const sm=await webmasters.sitemaps.list({siteUrl:GSC_SITE_URL});
    report.google.sitemaps=(sm.data.sitemap||[]).map(x=>({path:x.path,lastSubmitted:x.lastSubmitted,lastDownloaded:x.lastDownloaded,isPending:x.isPending,warnings:x.warnings,errors:x.errors}));
    const end=new Date(Date.now()-3*86400000);const start=new Date(end.getTime()-27*86400000);const d=x=>x.toISOString().slice(0,10);
    const perf=await webmasters.searchanalytics.query({siteUrl:GSC_SITE_URL,requestBody:{startDate:d(start),endDate:d(end),dimensions:['date'],rowLimit:100}});
    const rows=perf.data.rows||[];report.google.performance30d=rows.reduce((a,r)=>{a.clicks+=(r.clicks||0);a.impressions+=(r.impressions||0);return a},{clicks:0,impressions:0});
    const smMain=await fetchText(`${SITE_ORIGIN}/sitemap.xml?seoops=gsc`);const sample=locs(smMain.text).filter(u=>u.startsWith(SITE_ORIGIN)).slice(0,5);
    report.google.urlInspection=[];
    for(const u of sample){
      try{const x=await searchconsole.urlInspection.index.inspect({requestBody:{inspectionUrl:u,siteUrl:GSC_SITE_URL,languageCode:'zh-CN'}});const s=x.data.inspectionResult?.indexStatusResult||{};report.google.urlInspection.push({url:u,verdict:s.verdict,coverageState:s.coverageState,indexingState:s.indexingState,lastCrawlTime:s.lastCrawlTime,pageFetchState:s.pageFetchState,googleCanonical:s.googleCanonical,userCanonical:s.userCanonical});}
      catch(e){report.google.urlInspection.push({url:u,error:e.message});}
    }
    if(WRITE_MODE){for(const feed of [`${SITE_ORIGIN}/sitemap.xml`,`${SITE_ORIGIN}/news-sitemap.xml`,`${SITE_ORIGIN}/sitemap-legal.xml`]){await webmasters.sitemaps.submit({siteUrl:GSC_SITE_URL,feedpath:feed});}report.google.sitemapsSubmitted=true;}
  }catch(e){report.failures.push(`Google Search Console: ${e.message}`);}
}

async function bingCall(method,{body=null,query={}}={}){
  const url=new URL(`https://ssl.bing.com/webmaster/api.svc/json/${method}`);
  url.searchParams.set('apikey',BING_KEY);for(const [key,value] of Object.entries(query)){if(value!==undefined&&value!==null)url.searchParams.set(key,String(value));}
  const init=body?{method:'POST',headers:{'content-type':'application/json; charset=utf-8'},body:JSON.stringify(body)}:{};
  const r=await fetch(url,init);const text=await r.text();if(!r.ok)throw new Error(`${method} HTTP ${r.status}: ${text.slice(0,180)}`);try{return JSON.parse(text)}catch{return{text}};
}
async function bingOps(){
  if(!BING_KEY){report.bing.reason='missing BING_WEBMASTER_API_KEY';return;}
  report.bing.configured=true;
  try{
    const sites=await bingCall('GetUserSites');report.bing.sites=sites?.d||sites;
    const crawl=await bingCall('GetCrawlIssues',{query:{siteUrl:SITE_ORIGIN}});
    const crawlIssues=crawl?.d||crawl||[];report.bing.crawlIssues={count:Array.isArray(crawlIssues)?crawlIssues.length:null,items:Array.isArray(crawlIssues)?crawlIssues.slice(0,200):crawlIssues};
    const quotaRaw=await bingCall('GetUrlSubmissionQuota',{query:{siteUrl:SITE_ORIGIN}});
    const quota=quotaRaw?.d||quotaRaw||{};report.bing.urlSubmissionQuota=quota;
    if(WRITE_MODE){
      for(const feedUrl of [`${SITE_ORIGIN}/sitemap.xml`,`${SITE_ORIGIN}/news-sitemap.xml`,`${SITE_ORIGIN}/sitemap-legal.xml`])await bingCall('SubmitFeed',{body:{siteUrl:SITE_ORIGIN,feedUrl}});
      report.bing.sitemapsSubmitted=true;
      const dailyRaw=quota?.DailyQuota??quota?.dailyQuota;const daily=Number(dailyRaw);
      const maxBatch=Number.isFinite(daily)?Math.max(0,Math.min(500,daily)):100;
      const candidates=(report.local.submissionCandidates||[]).slice(0,maxBatch);
      if(candidates.length){await bingCall('SubmitUrlBatch',{body:{siteUrl:SITE_ORIGIN,urlList:candidates}});report.bing.urlBatchSubmitted=candidates.length;}
      else report.warnings.push('Bing URL batch skipped: no quota or no live-audit-passing URLs');
    }
  }catch(e){report.failures.push(`Bing Webmaster: ${e.message}`);}
}
await localAudit();await googleOps();await bingOps();
if(!report.google.configured){
  const message='Google Search Console account API not authorized yet';
  (REQUIRE_GOOGLE?report.failures:report.warnings).push(message);
}
if(!report.bing.configured){const message='Bing Webmaster account API not authorized yet';(REQUIRE_BING?report.failures:report.warnings).push(message);}
await fs.writeFile('seo-search-engine-ops-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({site:report.site,writeMode:report.writeMode,googleConfigured:report.google.configured,bingConfigured:report.bing.configured,warnings:report.warnings,failures:report.failures},null,2));
if(report.failures.length)process.exitCode=1;
