import fs from 'node:fs';

const SITE = 'https://trrb.net';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('[article-urls] Supabase env missing; skip SEO URL upgrade');
  process.exit(0);
}

const FALLBACK_CATEGORY_SLUGS = new Map([
  ['重要新闻', 'important-news'],
  ['热门头条', 'hot-headlines'],
  ['美国时政', 'us-politics'],
  ['美国警情', 'us-crime'],
  ['中国官场', 'china-officialdom'],
  ['移民美国', 'immigration'],
  ['庇护百科', 'asylum'],
  ['驱逐快报', 'deport'],
  ['ICE执法动态', 'ice'],
  ['ICE执法', 'ice'],
  ['曝光墙', 'expose']
]);
const SECTION_ALIASES = new Map([
  ['important', 'important-news'],
  ['hot', 'hot-headlines'],
  ['politics', 'us-politics'],
  ['crime', 'us-crime'],
  ['china', 'china-officialdom']
]);

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Accept: 'application/json'
};

async function fetchAll(table, select, extra = {}) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    url.searchParams.set('select', select);
    Object.entries(extra).forEach(([key, value]) => url.searchParams.set(key, value));
    if (!url.searchParams.has('order')) url.searchParams.set('order', 'id.asc');
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`${table} ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const batch = await response.json();
    if (!Array.isArray(batch)) break;
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

function safeSegment(value) {
  return encodeURIComponent(String(value || '').trim());
}
function canonicalSection(value) {
  const raw = String(value || '').trim();
  return SECTION_ALIASES.get(raw) || raw;
}

function articleSection(article, categoriesById, categoriesByName) {
  const topic = String(article.topic_key || '').trim().toLowerCase();
  if (topic === 'trump') return 'trump';
  if (topic === 'ice') return 'ice';

  const byId = categoriesById.get(String(article.category_id || ''));
  if (byId?.slug) return canonicalSection(byId.slug);
  const byName = categoriesByName.get(String(article.category_name || '').trim());
  if (byName?.slug) return canonicalSection(byName.slug);
  return FALLBACK_CATEGORY_SLUGS.get(String(article.category_name || '').trim()) || 'news';
}

function prettyUrl(article, categoriesById, categoriesByName) {
  const section = articleSection(article, categoriesById, categoriesByName);
  const slug = String(article.slug || '').trim() || String(article.id || '').trim();
  if (!slug) return '';
  return `${SITE}/${safeSegment(section)}/${safeSegment(slug)}`;
}

function decodeId(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function upgradeText(text, routes) {
  return String(text || '').replace(/https:\/\/(?:www\.)?trrb\.net\/article\.html\?id=([^<"'&\s]+)/gi, (full, encodedId) => {
    const id = decodeId(encodedId);
    return routes.get(id) || full.replace('https://www.trrb.net', SITE);
  });
}

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function dateOnly(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

const categories = await fetchAll('categories', 'id,name,slug', { is_active: 'eq.true' });
const categoriesById = new Map(categories.map((row) => [String(row.id || ''), row]));
const categoriesByName = new Map(categories.map((row) => [String(row.name || '').trim(), row]));
const articles = await fetchAll(
  'articles',
  'id,title,slug,category_id,category_name,topic_key,status,published_at,created_at',
  { status: 'eq.published' }
);

const routes = new Map();
for (const article of articles) {
  const id = String(article.id || '').trim();
  const url = prettyUrl(article, categoriesById, categoriesByName);
  if (id && url) routes.set(id, url);
}

const files = ['sitemap.xml', 'news-sitemap.xml', 'feed.xml'];
let replacements = 0;
let sitemapAdded = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = upgradeText(before, routes);

  if (file === 'sitemap.xml' && /<urlset\b/i.test(after)) {
    const existing = new Set(
      [...after.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
        .map((match) => match[1].replaceAll('&amp;', '&').trim())
    );
    const blocks = [];
    for (const article of articles) {
      const id = String(article.id || '').trim();
      const loc = routes.get(id);
      if (!id || !loc || existing.has(loc) || !String(article.title || '').trim()) continue;
      blocks.push(`  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${dateOnly(article.published_at || article.created_at)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`);
      existing.add(loc);
      sitemapAdded += 1;
    }
    if (blocks.length) {
      after = after.replace(/\s*<\/urlset>\s*$/i, `\n${blocks.join('\n')}\n</urlset>\n`);
    }
  }

  if (after !== before) {
    fs.writeFileSync(file, after);
    replacements += 1;
    console.log(`[article-urls] upgraded ${file}`);
  } else {
    console.log(`[article-urls] no legacy article URLs in ${file}`);
  }
}

console.log(`[article-urls] route map ${routes.size}; sitemap late-publish additions ${sitemapAdded}; files changed ${replacements}`);

// Only after sitemap/news-sitemap/feed have canonical pretty URLs do we write
// server-delivered homepage and ICE discovery anchors. This prevents the build
// itself from reintroducing /article.html?id= links into crawlable HTML.
await import('./inject-static-news-links.mjs');
