#!/usr/bin/env node
import fs from 'node:fs';

const SITE = 'https://trrb.net';
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const ARTICLE_SECTIONS = new Set(['ice','trump','important-news','hot-headlines','us-politics','us-crime','china-officialdom','immigration','asylum','deport','news','expose']);
const report = { generated_at: new Date().toISOString(), site: SITE, host: {}, sitemaps: {}, articles: [], pages: {}, legacy: {}, failures: [], warnings: [] };

async function fetchOne(url, opts={}) {
  try {
    const res = await fetch(url, { redirect: opts.redirect || 'manual', headers: { 'user-agent': opts.ua || UA, accept: opts.accept || '*/*', 'cache-control': 'no-cache' } });
    const text = await res.text();
    return { ok: true, status: res.status, url: res.url, location: res.headers.get('location') || '', type: res.headers.get('content-type') || '', xrobots: res.headers.get('x-robots-tag') || '', prerender: res.headers.get('x-trrb-prerender') || '', categoryPrerender: res.headers.get('x-trrb-category-prerender') || '', sitemapVersion: res.headers.get('x-trrb-sitemap') || '', newsVersion: res.headers.get('x-trrb-news-sitemap') || '', text };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), status: 0, text: '' };
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
function isArticleLoc(value='') {
  if (/^https:\/\/trrb\.net\/article\.html\?id=/i.test(value)) return true;
  try {
    const u = new URL(value, SITE);
    if (u.hostname !== 'trrb.net' && u.hostname !== 'www.trrb.net') return false;
    const parts = decodeURIComponent(u.pathname).split('/').filter(Boolean);
    return parts.length === 2 && ARTICLE_SECTIONS.has(parts[0]) && !(parts[0] === 'ice' && parts[1] === 'news');
  } catch { return false; }
}
function articleLocs(xml='') { return locs(xml).filter(isArticleLoc).map(u => u.replace('https://www.trrb.net', SITE)); }
function sitemapLocs(xml='') { return locs(xml).filter(u => /sitemap[^/]*\.xml/i.test(u) || /\/sitemap-[^/]+\.xml/i.test(u)); }
function text(html,re){ const m=String(html).match(re); return (m?.[1]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
function isIceUrl(value='') { try { const p=new URL(value, SITE).pathname; return p.startsWith('/ice/') && p !== '/ice/news'; } catch { return false; } }
function directLinks(html=''){ return [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(isArticleLoc); }

for (const source of ['http://trrb.net/','http://www.trrb.net/','https://www.trrb.net/']) {
  const {chain,finalUrl}=await redirectChain(source);
  report.host[source]={chain,final_url:finalUrl};
  const permanent=chain.length>0 && chain.every((hop,index)=> index===chain.length-1 && ![301,302,307,308].includes(hop.status) ? true : [301,308].includes(hop.status));
  if(!permanent || !finalUrl.startsWith(SITE)) report.failures.push(`bad host redirect chain ${source} => ${JSON.stringify(chain)}`);
  else if(chain.length>2) report.warnings.push(`host redirect chain has ${chain.length-1} hops: ${source}`);
}

const roots=[`${SITE}/sitemap.xml`,`${SITE}/news-sitemap.xml`];
const queue=[...roots];
const seen=new Set();
const articles=new Set();
while(queue.length && seen.size<30){
  const u=queue.shift();
  if(seen.has(u)) continue;
  seen.add(u);
  const r=await fetchOne(u,{redirect:'follow',accept:'application/xml,text/xml,*/*'});
  const urls=articleLocs(r.text);
  report.sitemaps[u]={status:r.status,type:r.type,bytes:r.text.length,article_count:urls.length,child_sitemaps:sitemapLocs(r.text),legacy_query_count:(r.text.match(/article\.html\?id=/gi)||[]).length,version:u.endsWith('/sitemap.xml')?r.sitemapVersion:r.newsVersion};
  if(r.status!==200){report.failures.push(`sitemap ${u} HTTP ${r.status}`);continue;}
  if(/article\.html\?id=/i.test(r.text)) report.failures.push(`legacy query URL found in ${u}`);
  for(const a of urls){if(articles.size<40)articles.add(a);}
  for(const child of sitemapLocs(r.text)){
    try{if(new URL(child).hostname==='trrb.net'&&!seen.has(child))queue.push(child);}catch{}
  }
}
for(const required of roots){if(!report.sitemaps[required])report.failures.push(`required sitemap not inspected: ${required}`);}
if((report.sitemaps[`${SITE}/sitemap.xml`]?.article_count||0)<5) report.failures.push('main sitemap article count too small');
const newsCount=report.sitemaps[`${SITE}/news-sitemap.xml`]?.article_count||0;
if(newsCount<1) report.failures.push('Google News sitemap has no recent article URLs');
if(articles.size<5) report.failures.push(`article sitemap sample too small: ${articles.size}`);

for (const u of [...articles].slice(0,12)) {
  const r = await fetchOne(u, { redirect:'follow', accept:'text/html,application/xhtml+xml' });
  const title = text(r.text,/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1 = text(r.text,/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const canonical = text(r.text,/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || text(r.text,/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  const body = text(r.text,/<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const row = { url:u, status:r.status, final_url:r.url, prerender:r.prerender, title_length:title.length, h1_length:h1.length, canonical, body_length:body.length, schema:/NewsArticle/.test(r.text), noindex:/noindex/i.test(r.xrobots) || /name=["']robots["'][^>]+noindex/i.test(r.text) };
  report.articles.push(row);
  const badPrerender=!String(row.prerender||'').startsWith('article-edge-');
  const badBody=isIceUrl(u)?row.body_length===0:row.body_length<80;
  if(row.status!==200||badPrerender||row.canonical!==u||badBody||!row.schema||row.noindex) report.failures.push({article:u,row});
}

const pageExpectations=[
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
  for(const asset of assets.slice(0,80)){
    let au;try{au=new URL(asset,r.url).href;}catch{continue;}
    if(new URL(au).hostname!=='trrb.net')continue;
    const ar=await fetchOne(au,{redirect:'follow',ua:'TRRB-SEO-Audit/4.0'});
    if(ar.status>=400)bad.push({url:au,status:ar.status});
  }
  const links=directLinks(r.text);
  const markerPresent=r.text.includes(expected.marker);
  const headerOk=!expected.header||r.categoryPrerender===expected.header;
  report.pages[expected.url]={status:r.status,final_url:r.url,asset_count:assets.length,bad_assets:bad,direct_article_links:links.length,marker_present:markerPresent,category_prerender:r.categoryPrerender};
  if(r.status>=400||bad.length)report.failures.push({page:expected.url,status:r.status,bad_assets:bad.slice(0,20)});
  if(links.length<expected.minLinks)report.failures.push({page:expected.url,problem:`too few direct article links: ${links.length}/${expected.minLinks}`});
  if(!markerPresent)report.failures.push({page:expected.url,problem:`missing prerender marker ${expected.marker}`});
  if(!headerOk)report.failures.push({page:expected.url,problem:`missing category prerender header: ${r.categoryPrerender}`});
}

const legacyUrl=`${SITE}/article.html?id=wp-117123`;
const legacy=await fetchOne(legacyUrl,{redirect:'manual',ua:UA,accept:'text/html'});
const legacyRow={status:legacy.status,location:legacy.location,xrobots:legacy.xrobots,final_status:0,final_url:'',canonical:'',body_length:0,noindex:false};
report.legacy[legacyUrl]=legacyRow;
if(![301,308].includes(legacy.status)||!legacy.location){
  report.failures.push(`legacy recoverable URL must permanently redirect: ${legacy.status}`);
}else{
  let target='';
  try{target=new URL(legacy.location,legacyUrl).href;}catch{}
  if(!target.startsWith(`${SITE}/`)||/article\.html\?id=/i.test(target)){
    report.failures.push(`legacy URL redirected to invalid/noncanonical target: ${target||legacy.location}`);
  }else{
    const final=await fetchOne(target,{redirect:'follow',ua:UA,accept:'text/html,application/xhtml+xml'});
    const canonical=text(final.text,/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)||text(final.text,/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
    const body=text(final.text,/<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const noindex=/noindex/i.test(final.xrobots)||/name=["']robots["'][^>]+noindex/i.test(final.text);
    Object.assign(legacyRow,{final_status:final.status,final_url:final.url,canonical,body_length:body.length,noindex});
    if(final.status!==200) report.failures.push(`legacy canonical target must return 200: ${final.status}`);
    if(canonical!==target) report.failures.push(`legacy canonical mismatch: expected ${target}, got ${canonical}`);
    if(body.length<80) report.failures.push(`legacy restored article body too short: ${body.length}`);
    if(noindex) report.failures.push('legacy restored canonical must remain indexable');
  }
}

fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/production-seo-latest.json', JSON.stringify(report,null,2));
console.log(JSON.stringify({failures:report.failures.length,warnings:report.warnings.length,sitemaps:report.sitemaps,legacy:report.legacy,pages:report.pages},null,2));

if (report.failures.length > 0) {
  console.error(`Production SEO diagnostic failed with ${report.failures.length} issue(s).`);
  process.exitCode = 1;
}
