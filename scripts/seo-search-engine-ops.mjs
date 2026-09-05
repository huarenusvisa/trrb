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
const CANONICAL_HOST=new URL(SITE_ORIGIN).hostname;
const PRIORITY_PAGES=[
  {key:'immigrate',url:`${SITE_ORIGIN}/immigrate/`,canonical:`${SITE_ORIGIN}/immigrate/`},
  {key:'immigrate-study',url:`${SITE_ORIGIN}/immigrate/center?path=study`,canonical:`${SITE_ORIGIN}/immigrate/center?path=study`},
  {key:'community',url:`${SITE_ORIGIN}/community/`,canonical:`${SITE_ORIGIN}/community/`}
];
const report={generatedAt:new Date().toISOString(),site:SITE_ORIGIN,writeMode:WRITE_MODE,priorityOrder:PRIORITY_PAGES.map(x=>x.url),google:{configured:false},bing:{configured:false},local:{},warnings:[],failures:[]};

async function fetchText(url){const r=await fetch(url,{headers:{'user-agent':'TRRB-SEO-Ops/3.0','cache-control':'no-cache'}});return{status:r.status,url:r.url,text:await r.text(),headers:Object.fromEntries(r.headers.entries())};}
function locs(xml){return[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replace(/&amp;/g,'&').trim());}
function cleanText(value){return String(value||'').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp|quot|#39);/gi,' ').replace(/\s+/g,' ').trim();}
function tagText(html,tag){const m=String(html||'').match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i'));return cleanText(m?.[1]||'');}
function metaDescription(html){const tags=String(html||'').match(/<meta\b[^>]*>/gi)||[];for(const tag of tags){if(!/\bname\s*=\s*["']description["']/i.test(tag))continue;const m=tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);if(m)return cleanText(m[1]);}return'';}
function canonicalHref(html){return(String(html||'').match(/<link\b[^>]*\brel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*\bhref\s*=\s*["']([^"']+)/i)?.[1]||String(html||'').match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["'][^"']*canonical/i)?.[1]||'').trim();}
function hasNoindex(html,headers={}){return/noindex/i.test(headers['x-robots-tag']||'')||/<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*\bcontent\s*=\s*["'][^"']*noindex/i.test(String(html||''));}
async function mapLimit(items,limit,fn){const out=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i);}}));return out;}
function unique(items){return[...new Set(items.filter(Boolean))];}
function isDeprecatedFeed(raw){try{const u=new URL(raw);const host=u.hostname.toLowerCase();return(host===`www.${CANONICAL_HOST}`)||(host===CANONICAL_HOST&&u.protocol!=='https:');}catch{return false;}}

async function redirectChain(start){
  const chain=[];let current=start;
  for(let i=0;i<5;i++){
    try{
      const r=await fetch(current,{redirect:'manual',headers:{'user-agent':'TRRB-SEO-Ops/3.0','cache-control':'no-cache'}});
      const location=r.headers.get('location')||'';
      chain.push({url:current,status:r.status,location});
      if(r.status>=300&&r.status<400&&location){current=new URL(location,current).href;continue;}
      return{start,chain,finalUrl:current,finalStatus:r.status};
    }catch(e){return{start,chain,finalUrl:current,finalStatus:0,error:e.message};}
  }
  return{start,chain,finalUrl:current,finalStatus:0,error:'redirect chain exceeded 5 hops'};
}

async function hostCanonicalAudit(){
  const variants=[`http://${CANONICAL_HOST}/`,`http://www.${CANONICAL_HOST}/`,`https://www.${CANONICAL_HOST}/`];
  report.local.hostCanonical=[];
  for(const url of variants){
    const row=await redirectChain(url);report.local.hostCanonical.push(row);
    if(row.finalUrl!==`${SITE_ORIGIN}/`||row.finalStatus!==200)report.failures.push(`Host canonical redirect broken: ${url} -> ${row.finalUrl} HTTP ${row.finalStatus}`);
    else if(row.chain.length>2)report.warnings.push(`Host redirect chain is longer than one redirect: ${url} (${row.chain.length-1} redirects)`);
  }
}

async function priorityPageAudit(){
  const sitemap=await fetchText(`${SITE_ORIGIN}/sitemap.xml?seoops=priority-${Date.now()}`);
  if(sitemap.status!==200){report.failures.push(`Priority audit sitemap HTTP ${sitemap.status}`);report.local.priorityPages=[];return[];}
  const sitemapUrls=new Set(locs(sitemap.text));
  const rows=[];const passing=[];
  for(const entry of PRIORITY_PAGES){
    try{
      const r=await fetchText(`${entry.url}${entry.url.includes('?')?'&':'?'}seo_priority=${Date.now()}`);
      const canonical=canonicalHref(r.text);const title=tagText(r.text,'title');const h1=tagText(r.text,'h1');const description=metaDescription(r.text);const noindex=hasNoindex(r.text,r.headers);
      const issues=[];
      if(r.status!==200)issues.push(`HTTP ${r.status}`);
      if(noindex)issues.push('noindex');
      if(canonical!==entry.canonical)issues.push(`canonical mismatch: ${canonical||'missing'}`);
      if(!sitemapUrls.has(entry.url))issues.push('missing from sitemap');
      if(!title)report.warnings.push(`Priority page title missing: ${entry.url}`);
      if(!h1)report.warnings.push(`Priority page H1 missing: ${entry.url}`);
      if(description.length<30)report.warnings.push(`Priority page description missing/short: ${entry.url}`);
      const row={key:entry.key,url:entry.url,status:r.status,finalUrl:r.url,canonical,title,h1,descriptionLength:description.length,noindex,inSitemap:sitemapUrls.has(entry.url),issues};rows.push(row);
      if(issues.length)for(const issue of issues)report.failures.push(`Priority page ${entry.key}: ${issue}`);else passing.push(entry.url);
    }catch(e){rows.push({key:entry.key,url:entry.url,status:0,issues:[e.message]});report.failures.push(`Priority page ${entry.key}: ${e.message}`);}
  }
  report.local.priorityPages=rows;return passing;
}

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
  await hostCanonicalAudit();
  const priority=await priorityPageAudit();
  try{const general=await livePageAudit();report.local.submissionCandidates=unique([...priority,...general]);}catch(e){report.failures.push(`Live page audit: ${e.message}`);report.local.submissionCandidates=priority;}
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
    const smBefore=await webmasters.sitemaps.list({siteUrl:GSC_SITE_URL});
    report.google.sitemapsBefore=(smBefore.data.sitemap||[]).map(x=>({path:x.path,lastSubmitted:x.lastSubmitted,lastDownloaded:x.lastDownloaded,isPending:x.isPending,warnings:x.warnings,errors:x.errors}));
    report.google.deprecatedSitemaps=report.google.sitemapsBefore.filter(x=>isDeprecatedFeed(x.path)).map(x=>x.path);
    report.google.deprecatedSitemapsRemoved=[];
    if(WRITE_MODE){
      for(const feed of report.google.deprecatedSitemaps){
        try{await webmasters.sitemaps.delete({siteUrl:GSC_SITE_URL,feedpath:feed});report.google.deprecatedSitemapsRemoved.push(feed);}
        catch(e){report.warnings.push(`Google old sitemap cleanup failed for ${feed}: ${e.message}`);}
      }
      for(const feed of [`${SITE_ORIGIN}/sitemap.xml`,`${SITE_ORIGIN}/news-sitemap.xml`,`${SITE_ORIGIN}/sitemap-legal.xml`])await webmasters.sitemaps.submit({siteUrl:GSC_SITE_URL,feedpath:feed});
      report.google.sitemapsSubmitted=true;
    }
    const smAfter=await webmasters.sitemaps.list({siteUrl:GSC_SITE_URL});
    report.google.sitemaps=(smAfter.data.sitemap||[]).map(x=>({path:x.path,lastSubmitted:x.lastSubmitted,lastDownloaded:x.lastDownloaded,isPending:x.isPending,warnings:x.warnings,errors:x.errors}));
    const end=new Date(Date.now()-3*86400000);const start=new Date(end.getTime()-27*86400000);const d=x=>x.toISOString().slice(0,10);
    const perf=await webmasters.searchanalytics.query({siteUrl:GSC_SITE_URL,requestBody:{startDate:d(start),endDate:d(end),dimensions:['date'],rowLimit:100}});
    const rows=perf.data.rows||[];report.google.performance30d=rows.reduce((a,r)=>{a.clicks+=(r.clicks||0);a.impressions+=(r.impressions||0);return a},{clicks:0,impressions:0});
    const smMain=await fetchText(`${SITE_ORIGIN}/sitemap.xml?seoops=gsc`);const articleSample=locs(smMain.text).filter(u=>u.startsWith(SITE_ORIGIN)&&!PRIORITY_PAGES.some(p=>p.url===u)).slice(0,2);
    const inspectionUrls=unique([...PRIORITY_PAGES.map(p=>p.url),...articleSample]);
    report.google.urlInspection=[];
    for(const u of inspectionUrls){
      try{const x=await searchconsole.urlInspection.index.inspect({requestBody:{inspectionUrl:u,siteUrl:GSC_SITE_URL,languageCode:'zh-CN'}});const s=x.data.inspectionResult?.indexStatusResult||{};report.google.urlInspection.push({url:u,priority:PRIORITY_PAGES.some(p=>p.url===u),verdict:s.verdict,coverageState:s.coverageState,indexingState:s.indexingState,lastCrawlTime:s.lastCrawlTime,pageFetchState:s.pageFetchState,googleCanonical:s.googleCanonical,userCanonical:s.userCanonical});}
      catch(e){report.google.urlInspection.push({url:u,priority:PRIORITY_PAGES.some(p=>p.url===u),error:e.message});}
    }
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
    try{
      const feedsRaw=await bingCall('GetFeeds',{query:{siteUrl:SITE_ORIGIN}});const feeds=feedsRaw?.d||feedsRaw||[];
      report.bing.feeds=feeds;report.bing.deprecatedFeeds=Array.isArray(feeds)?feeds.map(x=>x?.Url||x?.url||'').filter(isDeprecatedFeed):[];report.bing.deprecatedFeedsRemoved=[];
      if(WRITE_MODE){for(const feedUrl of report.bing.deprecatedFeeds){try{await bingCall('RemoveFeed',{body:{siteUrl:SITE_ORIGIN,feedUrl}});report.bing.deprecatedFeedsRemoved.push(feedUrl);}catch(e){report.warnings.push(`Bing old sitemap cleanup failed for ${feedUrl}: ${e.message}`);}}}
    }catch(e){report.warnings.push(`Bing feed inventory unavailable: ${e.message}`);}
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
      if(candidates.length){await bingCall('SubmitUrlBatch',{body:{siteUrl:SITE_ORIGIN,urlList:candidates}});report.bing.urlBatchSubmitted=candidates.length;report.bing.priorityUrlsSubmitted=PRIORITY_PAGES.map(x=>x.url).filter(url=>candidates.includes(url));}
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
console.log(JSON.stringify({site:report.site,writeMode:report.writeMode,priorityOrder:report.priorityOrder,googleConfigured:report.google.configured,bingConfigured:report.bing.configured,googleDeprecatedRemoved:report.google.deprecatedSitemapsRemoved||[],bingDeprecatedRemoved:report.bing.deprecatedFeedsRemoved||[],warnings:report.warnings,failures:report.failures},null,2));
if(report.failures.length)process.exitCode=1;
