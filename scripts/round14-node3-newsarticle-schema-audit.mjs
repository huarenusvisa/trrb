import { writeFileSync } from 'node:fs';

const ORIGIN=(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/$/,'');
const checks=[];let failures=0;
function check(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);}
async function req(pathOrUrl){const url=pathOrUrl.startsWith('http')?pathOrUrl:`${ORIGIN}${pathOrUrl}`;const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)','cache-control':'no-cache',accept:'text/html,application/xhtml+xml'}});return{status:r.status,url:r.url,text:await r.text(),headers:Object.fromEntries(r.headers.entries())};}
function locs(xml){return[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].trim());}
function extractJsonLd(html){const blocks=[];for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{blocks.push(JSON.parse(m[1]));}catch{blocks.push({__parse_error:true,__raw:m[1]});}}return blocks;}
function flatten(nodes){const out=[];for(const n of nodes){if(Array.isArray(n))out.push(...flatten(n));else if(n&&typeof n==='object'){out.push(n);if(Array.isArray(n['@graph']))out.push(...flatten(n['@graph']));}}return out;}
function findNewsArticle(html){return flatten(extractJsonLd(html)).find(n=>{const t=n?.['@type'];return t==='NewsArticle'||(Array.isArray(t)&&t.includes('NewsArticle'));});}
function validIso(v){return typeof v==='string'&&!Number.isNaN(Date.parse(v));}
function absolute(v){if(Array.isArray(v))v=v[0];if(v&&typeof v==='object')v=v.url||v.contentUrl;return typeof v==='string'&&/^https:\/\//i.test(v);}

const sitemap=await req('/news-sitemap.xml?r14=node3');
check(sitemap.status===200,'News Sitemap HTTP 200',`status=${sitemap.status}`);
const urls=locs(sitemap.text).filter(u=>u.startsWith(`${ORIGIN}/`)).slice(0,20);
check(urls.length>=10,'取得近期NewsArticle生产样本',`sample=${urls.length}`);

let parseBad=0,typeBad=0,headlineBad=0,imageBad=0,dateBad=0,publisherBad=0,mainEntityBad=0,canonicalBad=0,langBad=0,authorBad=0;
for(const url of urls){
  const r=await req(`${url}${url.includes('?')?'&':'?'}r14n3=1`);
  const blocks=extractJsonLd(r.text);if(blocks.some(x=>x.__parse_error))parseBad++;
  const a=findNewsArticle(r.text);if(!a){typeBad++;continue;}
  if(!String(a.headline||'').trim())headlineBad++;
  if(!absolute(a.image))imageBad++;
  if(!validIso(a.datePublished)||!validIso(a.dateModified||a.datePublished))dateBad++;
  const pub=a.publisher||{};if(!pub||!String(pub.name||'').trim()||!absolute(pub.logo))publisherBad++;
  const me=typeof a.mainEntityOfPage==='string'?a.mainEntityOfPage:a.mainEntityOfPage?.['@id'];if(String(me||'').replace(/\/$/,'')!==url.replace(/\/$/,''))mainEntityBad++;
  const c=(r.text.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)||r.text.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)||[])[1]||'';if(c.replace(/\/$/,'')!==url.replace(/\/$/,''))canonicalBad++;
  if(!/^zh(?:-|$)/i.test(String(a.inLanguage||'')))langBad++;
  const auth=a.author;if(!(auth&&(Array.isArray(auth)?auth.length>0:String(auth.name||auth).trim())))authorBad++;
}
check(parseBad===0,'JSON-LD 全部可解析',`bad=${parseBad}/${urls.length}`);
check(typeBad===0,'全部样本存在 NewsArticle',`bad=${typeBad}/${urls.length}`);
check(headlineBad===0,'NewsArticle headline 完整',`bad=${headlineBad}`);
check(imageBad===0,'NewsArticle image 为绝对HTTPS地址',`bad=${imageBad}`);
check(dateBad===0,'datePublished/dateModified 为有效时间',`bad=${dateBad}`);
check(publisherBad===0,'publisher 与 logo 完整',`bad=${publisherBad}`);
check(authorBad===0,'author 信息完整',`bad=${authorBad}`);
check(langBad===0,'inLanguage 标记中文',`bad=${langBad}`);
check(mainEntityBad===0,'mainEntityOfPage 指向当前canonical',`bad=${mainEntityBad}`);
check(canonicalBad===0,'HTML canonical 与NewsArticle页面一致',`bad=${canonicalBad}`);

writeFileSync('round14-node3-newsarticle-schema-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),origin:ORIGIN,sample:urls.length,checks,failures},null,2));
console.log(`ROUND14 NODE3 audit: checks=${checks.length}; failures=${failures}`);
if(failures===0)console.log('ROUND14 NODE3 PASS: NewsArticle structured data completeness verified');else{console.log('ROUND14 NODE3 FAIL: NewsArticle structured data issues detected');process.exitCode=1;}
