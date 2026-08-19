#!/usr/bin/env node
import fs from 'node:fs';

const SITE = 'https://trrb.net';
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const ARTICLE_SECTIONS = new Set(['ice','trump','important-news','hot-headlines','us-politics','us-crime','china-officialdom','immigration','asylum','deport','news','expose']);
const report = { generated_at: new Date().toISOString(), site: SITE, host: {}, sitemaps: {}, articles: [], pages: {}, failures: [], warnings: [] };

async function fetchOne(url, opts={}) {
  try {
    const res = await fetch(url, { redirect: opts.redirect || 'manual', headers: { 'user-agent': opts.ua || UA, accept: opts.accept || '*/*' } });
    const text = await res.text();
    return { ok: true, status: res.status, url: res.url, location: res.headers.get('location') || '', type: res.headers.get('content-type') || '', xrobots: res.headers.get('x-robots-tag') || '', prerender: res.headers.get('x-trrb-prerender') || '', text };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), status: 0, text: '' };
  }
}

function locs(xml='') {
  return [...String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(m => m[1].replaceAll('&amp;','&').trim()).filter(Boolean);
}
function isArticleLoc(value='') {
  if (/^https:\/\/trrb\.net\/article\.html\?id=/i.test(value)) return true;
  try {
    const u = new URL(value);
    if (u.hostname !== 'trrb.net' && u.hostname !== 'www.trrb.net') return false;
    const parts = decodeURIComponent(u.pathname).split('/').filter(Boolean);
    return parts.length === 2 && ARTICLE_SECTIONS.has(parts[0]) && !(parts[0] === 'ice' && parts[1] === 'news');
  } catch { return false; }
}
function articleLocs(xml='') { return locs(xml).filter(isArticleLoc).map(u => u.replace('https://www.trrb.net', SITE)); }
function sitemapLocs(xml='') { return locs(xml).filter(u => /sitemap[^/]*\.xml/i.test(u) || /\/sitemap-[^/]+\.xml/i.test(u)); }
function text(html,re){ const m=String(html).match(re); return (m?.[1]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
function isIceUrl(value='') { try { const p=new URL(value).pathname; return p.startsWith('/ice/') && p !== '/ice/news'; } catch { return false; } }

for (const u of ['http://trrb.net/','http://www.trrb.net/','https://www.trrb.net/']) {
  const r = await fetchOne(u);
  report.host[u] = { status:r.status, location:r.location, error:r.error||'' };
  if (![301,308].includes(r.status) || !r.location.startsWith(SITE)) report.failures.push(`host redirect ${u} => ${r.status} ${r.location}`);
}

const queue = [`${SITE}/sitemap.xml`, `${SITE}/news-sitemap.xml`];
const seen = new Set();
const articles = new Set();
while (queue.length && seen.size < 30 && articles.size < 20) {
  const u = queue.shift();
  if (seen.has(u)) continue;
  seen.add(u);
  const r = await fetchOne(u, { redirect:'follow', accept:'application/xml,text/xml,*/*' });
  report.sitemaps[u] = { status:r.status, type:r.type, bytes:r.text.length, article_count:articleLocs(r.text).length, child_sitemaps:sitemapLocs(r.text) };
  if (r.status !== 200) { report.failures.push(`sitemap ${u} HTTP ${r.status}`); continue; }
  for (const a of articleLocs(r.text)) articles.add(a);
  for (const child of sitemapLocs(r.text)) {
    try { if (new URL(child).hostname === 'trrb.net' && !seen.has(child)) queue.push(child); } catch {}
  }
}
if (articles.size < 5) report.failures.push(`article sitemap sample too small: ${articles.size}`);

for (const u of [...articles].slice(0,10)) {
  const r = await fetchOne(u, { redirect:'follow', accept:'text/html,application/xhtml+xml' });
  const title = text(r.text,/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1 = text(r.text,/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const canonical = text(r.text,/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || text(r.text,/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  const body = text(r.text,/<div[^>]+class=["'][^"']*article-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const row = { url:u, status:r.status, final_url:r.url, prerender:r.prerender, title_length:title.length, h1_length:h1.length, canonical, body_length:body.length, schema:/NewsArticle/.test(r.text), noindex:/noindex/i.test(r.xrobots) || /name=["']robots["'][^>]+noindex/i.test(r.text) };
  report.articles.push(row);
  const badPrerender = !String(row.prerender || '').startsWith('article-edge-');
  const badBody = isIceUrl(u) ? row.body_length === 0 : row.body_length < 80;
  if (row.status !== 200 || badPrerender || row.canonical !== u || badBody || !row.schema || row.noindex) report.failures.push({ article:u, row });
}

for (const u of [`${SITE}/`,`${SITE}/ice`,`${SITE}/ice/news`]) {
  const r = await fetchOne(u,{redirect:'follow',ua:'TRRB-SEO-Audit/3.0',accept:'text/html'});
  const assets = [...r.text.matchAll(/<(?:script|link|img|source)\b[^>]*(?:src|href)=["']([^"'#]+)["']/gi)].map(m=>m[1]).filter(v=>!v.startsWith('data:'));
  const bad=[];
  for (const asset of assets.slice(0,80)) {
    let au; try { au = new URL(asset,r.url).href; } catch { continue; }
    if (new URL(au).hostname !== 'trrb.net') continue;
    const ar = await fetchOne(au,{redirect:'follow',ua:'TRRB-SEO-Audit/3.0'});
    if (ar.status >= 400) bad.push({url:au,status:ar.status});
  }
  const directArticleLinks = [...r.text.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(isArticleLoc).length;
  report.pages[u]={status:r.status,final_url:r.url,asset_count:assets.length,bad_assets:bad,direct_article_links:directArticleLinks};
  if (r.status >= 400 || bad.length) report.failures.push({page:u,status:r.status,bad_assets:bad.slice(0,20)});
  if ((u === `${SITE}/` || u === `${SITE}/ice`) && directArticleLinks < 3) report.failures.push({page:u,problem:`too few direct article links: ${directArticleLinks}`});
}

fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/production-seo-latest.json', JSON.stringify(report,null,2));
console.log(JSON.stringify({failures:report.failures.length, sitemaps:Object.keys(report.sitemaps).length, articles:report.articles.length, pages:report.pages},null,2));
