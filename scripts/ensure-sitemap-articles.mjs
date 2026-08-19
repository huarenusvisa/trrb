import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const SITE = 'https://trrb.net';
const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!base || !key) throw new Error('Supabase credentials required for sitemap assurance');
if (!fs.existsSync(SITEMAP)) throw new Error('sitemap.xml missing before assurance');

const escapeXml = (v='') => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');

async function fetchPublished() {
  const all = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const url = new URL(`${base}/rest/v1/articles`);
    url.searchParams.set('select','id,title,published_at,created_at');
    url.searchParams.set('status','eq.published');
    url.searchParams.set('order','published_at.desc.nullslast,created_at.desc');
    url.searchParams.set('limit',String(pageSize));
    url.searchParams.set('offset',String(offset));
    const res = await fetch(url,{headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'}});
    if (!res.ok) throw new Error(`published articles query failed ${res.status}`);
    const rows = await res.json();
    all.push(...(Array.isArray(rows)?rows:[]));
    if (!Array.isArray(rows) || rows.length < pageSize) break;
  }
  return all;
}

const articles = await fetchPublished();
if (!articles.length) throw new Error('No published articles returned');

let xml = fs.readFileSync(SITEMAP,'utf8');
if (!/<urlset\b/i.test(xml)) throw new Error('sitemap.xml is not a urlset before assurance');

const existing = new Set([...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(m=>m[1].replaceAll('&amp;','&').trim()));
let added = 0;
const blocks = [];
for (const row of articles) {
  if (!row?.id || !String(row.title||'').trim()) continue;
  const loc = `${SITE}/article.html?id=${encodeURIComponent(row.id)}`;
  if (existing.has(loc)) continue;
  const rawDate = row.published_at || row.created_at || new Date().toISOString();
  const d = new Date(rawDate);
  const lastmod = Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0,10) : d.toISOString().slice(0,10);
  blocks.push(`  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`);
  existing.add(loc);
  added += 1;
}

if (blocks.length) xml = xml.replace(/\s*<\/urlset>\s*$/i, `\n${blocks.join('\n')}\n</urlset>\n`);
fs.writeFileSync(SITEMAP, xml);

const finalArticleCount = [...xml.matchAll(/<loc>https:\/\/trrb\.net\/article\.html\?id=/g)].length;
console.log(`[sitemap-assure] published=${articles.length}; added=${added}; finalArticleUrls=${finalArticleCount}`);
if (finalArticleCount < Math.min(3, articles.length)) throw new Error(`Sitemap still has too few article URLs: ${finalArticleCount}`);

// Build-time crawlability fix: news-sitemap.xml is generated before this script.
// Inject real, visible article anchors into the initial HTML for homepage and ICE pages.
// Runtime JavaScript may replace these snapshots with live data after load, but crawlers
// and no-JS clients always receive direct article links in the server-delivered HTML.
await import('./inject-static-news-links.mjs');
