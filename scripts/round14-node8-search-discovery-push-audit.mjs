#!/usr/bin/env node
import fs from 'node:fs';

const ORIGIN=String(process.env.SITE_ORIGIN||'https://trrb.net').replace(/\/+$/,'');
const INDEXNOW_KEY='08665bdb2ead4dcf7d8e6afc895c07d7';
const checks=[];const failures=[];
function record(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`);if(!ok)failures.push({label,detail});}
async function get(path){const r=await fetch(`${ORIGIN}${path}${path.includes('?')?'&':'?'}r14n8=${Date.now()}`,{headers:{'cache-control':'no-cache','user-agent':'Mozilla/5.0 (compatible; TRRB-R14-DiscoveryAudit/1.0)'}});return{status:r.status,text:await r.text(),headers:Object.fromEntries(r.headers.entries())};}
function locs(xml){return[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].trim());}
function rssLinks(xml){return[...xml.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>[\s\S]*?<\/item>/g)].map(m=>m[1].trim());}

const robots=await get('/robots.txt');
record(robots.status===200,'robots.txt HTTP 200',`status=${robots.status}`);
record(/Sitemap:\s*https:\/\/trrb\.net\/sitemap\.xml/i.test(robots.text),'robots.txt 声明主 Sitemap');
record(/Sitemap:\s*https:\/\/trrb\.net\/news-sitemap\.xml/i.test(robots.text),'robots.txt 声明 News Sitemap');

const [sitemap,news,rss,keyFile]=await Promise.all([get('/sitemap.xml'),get('/news-sitemap.xml'),get('/feed.xml'),get(`/${INDEXNOW_KEY}.txt`)]);
record(sitemap.status===200,'Google主Sitemap发现入口可用',`status=${sitemap.status}`);
record(news.status===200,'Google News Sitemap发现入口可用',`status=${news.status}`);
record(rss.status===200,'RSS发现入口可用',`status=${rss.status}`);
record(keyFile.status===200&&keyFile.text.trim()===INDEXNOW_KEY,'IndexNow key验证文件生产可访问',`status=${keyFile.status}`);

const newsUrls=locs(news.text).filter(u=>u.startsWith(`${ORIGIN}/`));
const sitemapUrls=new Set(locs(sitemap.text));
const feedUrls=new Set(rssLinks(rss.text));
record(newsUrls.length>=1,'News Sitemap包含近期新闻URL',`urls=${newsUrls.length}`);
const latest=newsUrls[0]||'';
record(Boolean(latest),'取得最新新闻发现目标',latest||'missing');
if(latest){
  record(sitemapUrls.has(latest),'最新新闻同步进入主Sitemap',latest);
  record(feedUrls.has(latest),'最新新闻同步进入RSS',latest);
  const article=await fetch(`${latest}${latest.includes('?')?'&':'?'}r14n8article=${Date.now()}`,{redirect:'follow',headers:{'cache-control':'no-cache','user-agent':'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'}});
  record(article.status===200,'最新新闻Googlebot抓取HTTP 200',`status=${article.status}`);
  const html=await article.text();
  record(!/noindex/i.test((html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i)||[])[1]||''),'最新新闻无意外noindex');
}

let indexNowStatus=0,indexNowText='';
if(latest&&keyFile.status===200){
  try{
    const response=await fetch('https://api.indexnow.org/indexnow',{
      method:'POST',headers:{'content-type':'application/json; charset=utf-8','user-agent':'TRRB-R14-IndexNow/1.0'},
      body:JSON.stringify({host:'trrb.net',key:INDEXNOW_KEY,keyLocation:`${ORIGIN}/${INDEXNOW_KEY}.txt`,urlList:[latest]})
    });
    indexNowStatus=response.status;indexNowText=(await response.text()).slice(0,300);
  }catch(error){indexNowText=String(error?.message||error);}
}
record([200,202].includes(indexNowStatus),'Bing/IndexNow最新新闻推送被接受',`status=${indexNowStatus}${indexNowText?`; body=${indexNowText}`:''}`);

const sitemapHeaders=sitemap.headers['cache-control']||'';
const newsHeaders=news.headers['cache-control']||'';
record(/max-age=(?:[0-9]|[12][0-9]|30)\b/.test(sitemapHeaders),'主Sitemap缓存不超过30秒',sitemapHeaders);
record(/max-age=(?:[0-9]|[12][0-9]|30)\b/.test(newsHeaders),'News Sitemap缓存不超过30秒',newsHeaders);

fs.writeFileSync('round14-node8-search-discovery-push-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),origin:ORIGIN,latest,indexNowStatus,checks,failures},null,2)+'\n');
console.log(`ROUND14 NODE8 audit: checks=${checks.length}; failures=${failures.length}`);
if(failures.length){console.log('ROUND14 NODE8 FAIL: Google / Bing discovery or push chain issue detected');process.exit(1);}
console.log('ROUND14 NODE8 PASS: Google / Bing new-article discovery and push chain verified');
