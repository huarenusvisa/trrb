import fs from 'node:fs/promises';
import process from 'node:process';
import { google } from 'googleapis';

const SITE_ORIGIN=(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/$/,'');
const GSC_SITE_URL=process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL||'sc-domain:trrb.net';
const GSC_JSON=process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON||'';
const BING_KEY=process.env.BING_WEBMASTER_API_KEY||'';
const WRITE_MODE=/^(1|true|yes)$/i.test(process.env.SEO_WRITE_MODE||'false');
const REQUIRE_GOOGLE=/^(1|true|yes)$/i.test(process.env.SEO_REQUIRE_GOOGLE||'false');
const report={generatedAt:new Date().toISOString(),site:SITE_ORIGIN,writeMode:WRITE_MODE,google:{configured:false},bing:{configured:false},local:{},warnings:[],failures:[]};

async function fetchText(url){const r=await fetch(url,{headers:{'user-agent':'TRRB-SEO-Ops/1.0','cache-control':'no-cache'}});return{status:r.status,text:await r.text(),headers:Object.fromEntries(r.headers.entries())};}
function locs(xml){return[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replace(/&amp;/g,'&').trim());}

async function localAudit(){
  for(const p of ['/robots.txt','/sitemap.xml','/news-sitemap.xml','/sitemap-legal.xml']){
    try{const r=await fetchText(`${SITE_ORIGIN}${p}?seoops=${Date.now()}`);report.local[p]={status:r.status,bytes:r.text.length};if(r.status!==200)report.failures.push(`${p} HTTP ${r.status}`)}catch(e){report.failures.push(`${p} ${e.message}`)}
  }
}

async function googleOps(){
  if(!GSC_JSON){report.google.reason='missing GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON';return;}
  let creds;try{creds=JSON.parse(GSC_JSON)}catch{report.failures.push('Google service account JSON is invalid');return;}
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

async function bingCall(method,{body=null}={}){
  const url=`https://ssl.bing.com/webmaster/api.svc/json/${method}?apikey=${encodeURIComponent(BING_KEY)}`;
  const init=body?{method:'POST',headers:{'content-type':'application/json; charset=utf-8'},body:JSON.stringify(body)}:{};
  const r=await fetch(url,init);const text=await r.text();if(!r.ok)throw new Error(`${method} HTTP ${r.status}: ${text.slice(0,180)}`);try{return JSON.parse(text)}catch{return{text}};
}
async function bingOps(){
  if(!BING_KEY){report.bing.reason='missing BING_WEBMASTER_API_KEY';return;}
  report.bing.configured=true;
  try{
    const sites=await bingCall('GetUserSites');report.bing.sites=sites?.d||sites;
    if(WRITE_MODE){for(const feedUrl of [`${SITE_ORIGIN}/sitemap.xml`,`${SITE_ORIGIN}/news-sitemap.xml`,`${SITE_ORIGIN}/sitemap-legal.xml`]){await bingCall('SubmitFeed',{body:{siteUrl:SITE_ORIGIN,feedUrl}});}report.bing.sitemapsSubmitted=true;}
  }catch(e){report.failures.push(`Bing Webmaster: ${e.message}`);}
}

await localAudit();await googleOps();await bingOps();
if(!report.google.configured){
  const message='Google Search Console account API not authorized yet';
  (REQUIRE_GOOGLE?report.failures:report.warnings).push(message);
}
if(!report.bing.configured)report.warnings.push('Bing Webmaster account API not authorized yet; IndexNow remains separate');
await fs.writeFile('seo-search-engine-ops-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({site:report.site,writeMode:report.writeMode,googleConfigured:report.google.configured,bingConfigured:report.bing.configured,warnings:report.warnings,failures:report.failures},null,2));
if(report.failures.length)process.exitCode=1;
