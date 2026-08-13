import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');
const NEWS_SITEMAP_PATH = path.join(ROOT, 'news-sitemap.xml');
const CANONICAL_ORIGIN = 'https://trrb.net';
const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!base || !key) {
  console.warn('[sitemap-clean] Supabase credentials unavailable; keeping generated sitemap unchanged');
  process.exit(0);
}

async function fetchPublishedIds() {
  const ids = new Set();
  const pageSize = 1000;
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const url = new URL(`${base}/rest/v1/articles`);
    url.searchParams.set('select', 'id');
    url.searchParams.set('status', 'eq.published');
    url.searchParams.set('order', 'id.asc');
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`published article query failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
    }
    const rows = await response.json();
    for (const row of rows || []) {
      if (row?.id) ids.add(String(row.id));
    }
    if (!Array.isArray(rows) || rows.length < pageSize) break;
  }
  return ids;
}

function normalizeCanonicalLoc(loc) {
  try {
    const url = new URL(loc);
    if (!['trrb.net', 'www.trrb.net'].includes(url.hostname)) return loc;
    url.protocol = 'https:';
    url.hostname = 'trrb.net';
    url.port = '';
    url.hash = '';
    return url.toString();
  } catch {
    return loc;
  }
}

function articleIdFromLoc(loc) {
  try {
    const url = new URL(loc);
    if (!['trrb.net', 'www.trrb.net'].includes(url.hostname)) return null;
    if (url.pathname !== '/article.html') return null;
    return url.searchParams.get('id');
  } catch {
    return null;
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function cleanUrlset(filePath, publishedIds) {
  if (!fs.existsSync(filePath)) return { before: 0, after: 0, removed: 0, normalized: 0 };
  const xml = fs.readFileSync(filePath, 'utf8');
  const blocks = xml.match(/\s*<url>[\s\S]*?<\/url>/g) || [];
  const kept = [];
  let removed = 0;
  let normalized = 0;

  for (const originalBlock of blocks) {
    const locMatch = originalBlock.match(/<loc>([\s\S]*?)<\/loc>/);
    const loc = String(locMatch?.[1] || '')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&apos;', "'")
      .trim();
    const articleId = articleIdFromLoc(loc);
    if (articleId && !publishedIds.has(articleId)) {
      removed += 1;
      continue;
    }

    const canonicalLoc = normalizeCanonicalLoc(loc);
    let block = originalBlock.trim();
    if (canonicalLoc !== loc && locMatch) {
      block = block.replace(locMatch[0], `<loc>${escapeXml(canonicalLoc)}</loc>`);
      normalized += 1;
    }
    kept.push(block);
  }

  const rootOpen = xml.match(/<urlset[^>]*>/)?.[0] || '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  const declaration = xml.match(/^<\?xml[^>]*\?>/)?.[0] || '<?xml version="1.0" encoding="UTF-8"?>';
  fs.writeFileSync(filePath, `${declaration}\n${rootOpen}\n${kept.map((block) => `  ${block.replace(/\n/g, '\n  ')}`).join('\n')}\n</urlset>\n`);
  return { before: blocks.length, after: kept.length, removed, normalized };
}

const publishedIds = await fetchPublishedIds();
const sitemapResult = cleanUrlset(SITEMAP_PATH, publishedIds);
const newsResult = cleanUrlset(NEWS_SITEMAP_PATH, publishedIds);

console.log(`[sitemap-clean] canonical origin ${CANONICAL_ORIGIN}`);
console.log(`[sitemap-clean] published IDs ${publishedIds.size}`);
console.log(`[sitemap-clean] sitemap ${sitemapResult.before} -> ${sitemapResult.after}; removed ${sitemapResult.removed}; normalized ${sitemapResult.normalized}`);
console.log(`[sitemap-clean] news sitemap ${newsResult.before} -> ${newsResult.after}; removed ${newsResult.removed}; normalized ${newsResult.normalized}`);

if (publishedIds.size > 0 && sitemapResult.after === 0) {
  throw new Error('Sitemap cleanup removed every URL unexpectedly');
}
