#!/usr/bin/env node
import fs from 'node:fs';

const SITE = 'https://trrb.net';
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
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
function articleLocs(xml='') { return locs(xml).filter(u => /^https:\/\/trrb\.net\/article\.html\?id=/i.test(u)); }
function sitemapLocs(xml='') { return locs(xml).filter(u => /sitemap[^/]*\.xml/i.test(u) || /\/sitemap-[^/]+\.xml/i.test(u)); }
function text(html,re){ const m=String(html).match(re); return (m?.[1]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }

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
  if (row.status !== 200 || row.prerender !== 'article-edge-v1' || row.canonical !== u || row.body_length < 120 || !row.schema || row.noindex) report.failures.push({ article:u, row });
}

for (const u of [`${SITE}/`,`${SITE}/ice`,`${SITE}/ice/news`]) {
  const r = await fetchOne(u,{redirect:'follow',ua:'TRRB-SEO-Audit/2.0',accept:'text/html'});
  const assets = [...r.text.matchAll(/<(?:script|link|img|source)\b[^>]*(?:src|href)=["']([^"'#]+)["']/gi)].map(m=>m[1]).filter(v=>!v.startsWith('data:'));
  const bad=[];
  for (const asset of assets.slice(0,80)) {
    let au; try { au = new URL(asset,r.url).href; } catch { continue; }
    if (new URL(au).hostname !== 'trrb.net') continue;
    const ar = await fetchOne(au,{redirect:'follow',ua:'TRRB-SEO-Audit/2.0'});
    if (ar.status >= 400) bad.push({url:au,status:ar.status});
  }
  report.pages[u]={status:r.status,final_url:r.url,asset_count:assets.length,bad_assets:bad};
  if (r.status >= 400 || bad.length) report.failures.push({page:u,status:r.status,bad_assets:bad.slice(0,20)});
}

fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/production-seo-latest.json', JSON.stringify(report,null,2));
console.log(JSON.stringify({failures:report.failures.length, sitemaps:Object.keys(report.sitemaps).length, articles:report.articles.length, pages:report.pages},null,2));
