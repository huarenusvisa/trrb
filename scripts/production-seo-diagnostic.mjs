#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function runProductionSeoDiagnostic(options = {}) {
const SITE = new URL(options.site || 'https://trrb.net').origin;
const fetchImpl = options.fetchImpl || fetch;
const limits = { requestTimeoutMs: 8000, durationMs: 180000, requests: 200, sitemaps: 30, sitemapUrls: 200000, sitemapSamples: 12, linkedSamples: 24, linksPerPage: 400, assetsPerPage: 12, ...options.limits };
for (const [key, value] of Object.entries(limits)) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid diagnostic limit: ${key}`);
}
const started = Date.now();
let requestCount = 0;
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const ARTICLE_SECTIONS = new Set(['ice','trump','important-news','hot-headlines','us-politics','us-crime','china-officialdom','immigration','asylum','deport','news','expose']);
const report = { generated_at: new Date().toISOString(), site: SITE, host: {}, sitemaps: {}, articles: [], pages: {}, legacy: {}, failures: [], warnings: [], coverage: { mode: 'bounded-sample', limits, completed: true, truncated: [] } };
function truncate(reason) {
  report.coverage.completed = false;
  if (!report.coverage.truncated.includes(reason)) report.coverage.truncated.push(reason);
}

async function fetchOne(url, opts={}) {
  const remaining = limits.durationMs - (Date.now() - started);
  if (remaining <= 0 || requestCount >= limits.requests) {
    truncate(remaining <= 0 ? 'duration budget exhausted' : 'request budget exhausted');
    return { ok: false, status: 0, url, text: '', error: 'Diagnostic budget exhausted' };
  }
  requestCount += 1;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(Math.min(limits.requestTimeoutMs, remaining)), redirect: opts.redirect || 'manual', headers: { 'user-agent': opts.ua || UA, accept: opts.accept || '*/*', 'cache-control': 'no-cache' } });
    const text = await res.text();
    return { ok: true, status: res.status, url: res.url, location: res.headers.get('location') || '', type: res.headers.get('content-type') || '', xrobots: res.headers.get('x-robots-tag') || '', prerender: res.headers.get('x-trrb-prerender') || '', categoryPrerender: res.headers.get('x-trrb-category-prerender') || '', sitemapVersion: res.headers.get('x-trrb-sitemap') || '', newsVersion: res.headers.get('x-trrb-news-sitemap') || '', text };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), status: 0, url, text: '' };
  }
}

async function redirectChain(source, maxHops=4) {
  const chain=[];
  let current=source;
  for(let i=0;i<maxHops;i++){
    const r=await fetchOne(current,{redirect:'manual'});
    chain.push({url:current,status:r.status,location:r.location,error:r.error||''});
    if(![301,302,307,308].includes(r.status)||!r.location) break;
    current=new URL(r.location,current).href;
  }
  const last=chain[chain.length-1];
  const finalUrl=last?.location?new URL(last.location,last.url).href:(last?.url||source);
  return {chain,finalUrl};
}

function locs(xml='') {
  return [...String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(m => m[1].replaceAll('&amp;','&').trim()).filter(Boolean);
}
function normalizeLocal(value='', base=SITE) {
  try {
    const u=new URL(String(value).replaceAll('&amp;','&'),base);
    if(!['http:','https:'].includes(u.protocol))return '';
    if(u.origin!==SITE && !(SITE==='https://trrb.net' && u.hostname==='www.trrb.net'))return '';
    return `${SITE}${u.pathname}${u.search}`;
  } catch { return ''; }
}
function isArticleLoc(value='',base=SITE) {
  try {
    const local=normalizeLocal(value,base);
    if(!local)return false;
    const u=new URL(local);
    if(u.pathname==='/article.html' && u.searchParams.has('id'))return true;
    const parts=decodeURIComponent(u.pathname).split('/').filter(Boolean);
    return parts.length===2 && ARTICLE_SECTIONS.has(parts[0]) && !(parts[0]==='ice' && parts[1]==='news');
  } catch { return false; }
}
function attributes(tag) {
  return Object.fromEntries([...String(tag).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),(m[2]??m[3]??m[4]).replaceAll('&amp;','&')]));
}
function metadata(html) {
  const tags=[...String(html).matchAll(/<(?:meta|link)\b[^>]*>/gi)].map(m=>attributes(m[0]));
  return {
    canonical:tags.find(t=>t.rel?.toLowerCase()==='canonical')?.href||'',
    description:tags.find(t=>t.name?.toLowerCase()==='description')?.content||'',
    noindex:tags.some(t=>['robots','googlebot'].includes(t.name?.toLowerCase()) && /\bnoindex\b/i.test(t.content||''))
  };
}
function spreadSample(values,count) {
  if(values.length<=count)return values;
  if(count===1)return [values[0]];
  return Array.from({length:count},(_,i)=>values[Math.round(i*(values.length-1)/(count-1))]);
}
function articleLocs(xml='') { return locs(xml).filter(u=>isArticleLoc(u)).map(u => normalizeLocal(u)); }
function sitemapLocs(xml='') { return locs(xml).filter(u => /sitemap[^/]*\.xml/i.test(u) || /\/sitemap-[^/]+\.xml/i.test(u)); }
function text(html,re){ const m=String(html).match(re); return (m?.[1]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
function directLinks(html='',base=SITE){ return [...new Set([...String(html).matchAll(/<a\b[^>]*>/gi)].map(m=>attributes(m[0]).href||'').filter(u=>isArticleLoc(u,base)).map(u=>normalizeLocal(u,base)))]; }

for (const source of options.hostSources || (SITE==='https://trrb.net' ? ['http://trrb.net/','http://www.trrb.net/','https://www.trrb.net/'] : [])) {
  const {chain,finalUrl}=await redirectChain(source);
  report.host[source]={chain,final_url:finalUrl};
  const permanent=chain.length>0 && chain.every((hop,index)=> index===chain.length-1 && ![301,302,307,308].includes(hop.status) ? true : [301,308].includes(hop.status));
  if(!permanent || finalUrl!==`${SITE}/` || chain.at(-1)?.status!==200) report.failures.push(`bad host redirect chain ${source} => ${JSON.stringify(chain)}`);
  else if(chain.length>2) report.warnings.push(`host redirect chain has ${chain.length-1} hops: ${source}`);
}

const roots=[`${SITE}/sitemap.xml`,`${SITE}/news-sitemap.xml`];
const queue=[...roots];
const seen=new Set();
const articles=new Set();
const discovered=new Map();
const pageGroups=[];
function discover(url,kind,source) {
  if(!discovered.has(url))discovered.set(url,new Map());
  discovered.get(url).set(`${kind}:${source}`,{kind,url:source});
}
while(queue.length && seen.size<limits.sitemaps){
  const u=queue.shift();
  if(seen.has(u)) continue;
  seen.add(u);
  const r=await fetchOne(u,{redirect:'follow',accept:'application/xml,text/xml,*/*'});
  const urls=articleLocs(r.text);
  report.sitemaps[u]={status:r.status,type:r.type,bytes:r.text.length,article_count:urls.length,child_sitemaps:sitemapLocs(r.text),legacy_query_count:(r.text.match(/article\.html\?id=/gi)||[]).length,version:u.endsWith('/sitemap.xml')?r.sitemapVersion:r.newsVersion};
  if(r.status!==200){report.failures.push(`sitemap ${u} HTTP ${r.status}`);truncate('some sitemaps could not be inspected');continue;}
  if(!/<(?:urlset|sitemapindex)\b/i.test(r.text)){report.failures.push(`sitemap ${u} did not return a sitemap document`);truncate('some sitemaps could not be inspected');continue;}
  if(/article\.html\?id=/i.test(r.text)) report.failures.push(`legacy query URL found in ${u}`);
  for(const a of urls){
    if(articles.size>=limits.sitemapUrls&&!articles.has(a)){truncate('sitemap URL storage limit reached');continue;}
    articles.add(a);discover(a,'sitemap',u);
  }
  for(const child of sitemapLocs(r.text)){
    const local=normalizeLocal(child);
    if(local&&!seen.has(local)&&!queue.includes(local))queue.push(local);
  }
}
if(queue.length)truncate('sitemap count limit reached');
const sitemapScanComplete=report.coverage.completed;
for(const required of roots){if(!report.sitemaps[required])report.failures.push(`required sitemap not inspected: ${required}`);}
const mainArticleCount = Object.entries(report.sitemaps)
  .filter(([url]) => url === `${SITE}/sitemap.xml` || /\/sitemap-articles-\d+\.xml$/i.test(url))
  .reduce((sum, [, row]) => sum + (row.article_count || 0), 0);
report.sitemaps.main_article_total = mainArticleCount;
if(mainArticleCount<5) report.failures.push('main sitemap article count too small');
const newsCount=report.sitemaps[`${SITE}/news-sitemap.xml`]?.article_count||0;
if(newsCount<1) report.failures.push('Google News sitemap has no recent article URLs');
if(articles.size<5) report.failures.push(`article sitemap sample too small: ${articles.size}`);

const pageExpectations=options.pageExpectations || [
  {url:`${SITE}/`,minLinks:10,marker:'data-seo-static-snapshot="build"'},
  {url:`${SITE}/important-news`,minLinks:10,marker:'data-seo-category-snapshot="edge"',header:'category-edge-v1'},
  {url:`${SITE}/asylum`,minLinks:3,marker:'data-seo-category-snapshot="edge"',header:'category-edge-v1'},
  {url:`${SITE}/ice`,minLinks:3,marker:'data-seo-static-snapshot="build"'},
  {url:`${SITE}/ice/news`,minLinks:3,marker:'data-seo-category-snapshot="edge"',header:'category-edge-v1'},
  {url:`${SITE}/trump`,minLinks:1,marker:'data-seo-static-snapshot="build"'}
];
for(const expected of pageExpectations){
  const r=await fetchOne(expected.url,{redirect:'follow',ua:'TRRB-SEO-Audit/4.0',accept:'text/html'});
  const assets=[...r.text.matchAll(/<(?:script|link|img|source)\b[^>]*(?:src|href)=["']([^"'#]+)["']/gi)].map(m=>m[1]).filter(v=>!v.startsWith('data:'));
  const bad=[];
  for(const asset of assets.slice(0,limits.assetsPerPage)){
    let au;try{au=new URL(asset,r.url).href;}catch{continue;}
    if(new URL(au).origin!==SITE)continue;
    const ar=await fetchOne(au,{redirect:'follow',ua:'TRRB-SEO-Audit/4.0'});
    if(ar.status===0||ar.status>=400)bad.push({url:au,status:ar.status});
  }
  const allLinks=directLinks(r.text,r.url||expected.url);
  const links=allLinks.slice(0,limits.linksPerPage);
  pageGroups.push(links);
  for(const link of links)discover(link,'page',expected.url);
  const markerPresent=!expected.marker||r.text.includes(expected.marker);
  const headerOk=!expected.header||/^category-edge-v[12]$/.test(r.categoryPrerender||'');
  report.pages[expected.url]={status:r.status,final_url:r.url,asset_count:assets.length,bad_assets:bad,direct_article_links:allLinks.length,discovered_article_links:links.length,discovery_truncated:allLinks.length>links.length,marker_present:markerPresent,category_prerender:r.categoryPrerender};
  if(r.status!==200||bad.length)report.failures.push({page:expected.url,status:r.status,bad_assets:bad.slice(0,20)});
  if(allLinks.length<(expected.minLinks||0))report.failures.push({page:expected.url,problem:`too few direct article links: ${links.length}/${expected.minLinks}`});
  if(!markerPresent)report.failures.push({page:expected.url,problem:`missing prerender marker ${expected.marker}`});
  if(!headerOk)report.failures.push({page:expected.url,problem:`missing category prerender header: ${r.categoryPrerender}`});
}

// Sample sitemap entries across their full order, then add actual page links.
// Each page gets a turn; sitemap-excluded URLs are considered first.
const sampled=new Set(spreadSample([...articles],limits.sitemapSamples));
const linkedSample=new Set();
const groups=pageGroups.map(links=>[...links.filter(u=>!articles.has(u)),...links.filter(u=>articles.has(u))]);
while(linkedSample.size<limits.linkedSamples && groups.some(g=>g.length)) {
  for(const group of groups) {
    while(group.length&&(sampled.has(group[0])||linkedSample.has(group[0])))group.shift();
    if(group.length&&linkedSample.size<limits.linkedSamples)linkedSample.add(group.shift());
  }
}
for(const u of linkedSample)sampled.add(u);
for(const u of sampled) {
  const r=await fetchOne(u,{redirect:'follow',accept:'text/html,application/xhtml+xml'});
  const meta=metadata(r.text);
  const title=text(r.text,/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1=text(r.text,/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const body=text(r.text,/<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const inSitemap=articles.has(u);
  const noindex=/\bnoindex\b/i.test(r.xrobots||'')||meta.noindex;
  const row={url:u,status:r.status,final_url:r.url,prerender:r.prerender,title_length:title.length,description_length:meta.description.length,h1_length:h1.length,canonical:meta.canonical,body_length:body.length,schema:/NewsArticle/.test(r.text),noindex,in_sitemap:inSitemap,sitemap_membership:inSitemap?'present':sitemapScanComplete?'absent':'unknown',discovered_from:[...discovered.get(u).values()],errors:[],warnings:[],error:r.error||''};
  if(r.status!==200)row.errors.push(`HTTP ${r.status}${r.error?`: ${r.error}`:''}`);
  if(noindex) {
    if(inSitemap)row.errors.push('sitemap-url-has-noindex');
    else row.warnings.push('linked-url-has-noindex; may be intentional; editorial intent requires review');
  }
  if(inSitemap||!noindex) {
    if(!String(r.prerender||'').startsWith('article-edge-'))row.errors.push('missing-article-prerender');
    if(!body)row.errors.push('article-body-missing');
    if(!title||!h1)row.errors.push('article-title-or-heading-missing');
    if(!meta.description)row.errors.push('article-description-missing');
    if(!row.schema)row.errors.push('missing-NewsArticle-schema');
    if(meta.canonical!==(inSitemap?u:r.url))row.errors.push('canonical-mismatch-or-missing');
    // Length alone is informational, never an indexability failure for a short report.
    if(body&&body.length<80)row.warnings.push('short-article-body; informational-only');
    if(title&&title.length<8)row.warnings.push('short-title; informational-only');
    if(meta.description&&meta.description.length<40)row.warnings.push('short-description; informational-only');
  }
  if(r.url!==u)(inSitemap?row.errors:row.warnings).push('discovered-url-redirects; link directly to canonical URL');
  report.articles.push(row);
  if(row.errors.length)report.failures.push({article:u,row});
  for(const warning of row.warnings)report.warnings.push({article:u,warning,discovered_from:row.discovered_from});
}

const legacyUrl=options.legacyUrl || `${SITE}/article.html?id=wp-117123`;
const legacy=await fetchOne(legacyUrl,{redirect:'manual',ua:UA,accept:'text/html'});
const legacyRow={status:legacy.status,location:legacy.location,xrobots:legacy.xrobots,final_status:0,final_url:'',canonical:'',body_length:0,noindex:false};
report.legacy[legacyUrl]=legacyRow;
if(![301,308].includes(legacy.status)||!legacy.location){
  report.failures.push(`legacy recoverable URL must permanently redirect: ${legacy.status}`);
}else{
  let target='';
  try{target=new URL(legacy.location,legacyUrl).href;}catch{}
  if(!target.startsWith(`${SITE}/`)||target===`${SITE}/`||/article\.html\?id=/i.test(target)){
    report.failures.push(`legacy URL redirected to invalid/noncanonical target: ${target||legacy.location}`);
  }else{
    const final=await fetchOne(target,{redirect:'follow',ua:UA,accept:'text/html,application/xhtml+xml'});
    const meta=metadata(final.text);
    const canonical=meta.canonical;
    const body=text(final.text,/<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const noindex=/\bnoindex\b/i.test(final.xrobots||'')||meta.noindex;
    Object.assign(legacyRow,{final_status:final.status,final_url:final.url,canonical,body_length:body.length,noindex});
    if(final.status!==200) report.failures.push(`legacy canonical target must return 200: ${final.status}`);
    if(canonical!==target) report.failures.push(`legacy canonical mismatch: expected ${target}, got ${canonical}`);
    if(!body.length) report.failures.push('legacy restored article body missing');
    if(noindex) report.failures.push('legacy restored canonical must remain indexable');
  }
}

const pageLinked=[...discovered].filter(([,sources])=>[...sources.values()].some(s=>s.kind==='page')).map(([url])=>url);
Object.assign(report.coverage,{
  request_count:requestCount,elapsed_ms:Date.now()-started,inspected_sitemaps:seen.size,sitemap_scan_complete:sitemapScanComplete,
  discovered_sitemap_articles:articles.size,discovered_linked_articles:pageLinked.length,
  linked_articles_outside_inspected_sitemaps:pageLinked.filter(u=>!articles.has(u)).length,
  sampled_articles:report.articles.length,sampled_from_sitemaps:report.articles.filter(a=>a.in_sitemap).length,
  sampled_outside_inspected_sitemaps:report.articles.filter(a=>!a.in_sitemap).length,
  linked_articles_not_sampled:pageLinked.filter(u=>!sampled.has(u)).length,
  noindex_policy:'Sitemap URLs must be indexable. Linked URLs outside inspected sitemaps may be intentionally excluded; editorial intent is unknown.',
  legacy_sample_count:1,legacy_scope:'One known recoverable regression URL only; not an audit of historical GSC failures.'
});
if(!report.coverage.completed)report.failures.push({diagnostic:'incomplete',reasons:report.coverage.truncated});
return report;
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const report=await runProductionSeoDiagnostic();
  fs.mkdirSync('reports',{recursive:true});
  fs.writeFileSync('reports/production-seo-latest.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({failures:report.failures.length,warnings:report.warnings.length,sitemaps:report.sitemaps,legacy:report.legacy,pages:report.pages,coverage:report.coverage},null,2));
  if(report.failures.length>0) {
    console.error(`Production SEO diagnostic failed with ${report.failures.length} issue(s).`);
    process.exitCode=1;
  }
}
