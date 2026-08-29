const SITE = 'https://trrb.net';
const PREVIEW_BASE = String(process.env.PREVIEW_BASE || '').replace(/\/+$/, '');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!PREVIEW_BASE) throw new Error('PREVIEW_BASE is required');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase credentials are required');

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Accept: 'application/json'
};

const FALLBACK_CATEGORY_SLUGS = new Map([
  ['重要新闻', 'important-news'],
  ['热门头条', 'hot-headlines'],
  ['中国热门头条', 'hot-headlines'],
  ['美国时政', 'us-politics'],
  ['美国警情', 'us-crime'],
  ['中国官场', 'china-officialdom'],
  ['移民美国', 'immigration'],
  ['庇护百科', 'asylum'],
  ['ICE执法动态', 'ice'],
  ['ICE执法', 'ice']
]);
const CANONICAL_SECTION_ALIASES = new Map([
  ['important', 'important-news'],
  ['hot', 'hot-headlines'],
  ['politics', 'us-politics'],
  ['crime', 'us-crime'],
  ['china', 'china-officialdom']
]);

function canonicalSection(value) {
  const section = String(value || '').trim();
  return CANONICAL_SECTION_ALIASES.get(section) || section;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options = {}, attempts = 5) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      console.log(`[preview] transient fetch failure (${attempt}/${attempts}): ${error?.cause?.code || error?.message || 'unknown'}`);
      await sleep(1200 * attempt);
    }
  }
  throw lastError || new Error(`fetch failed for ${url}`);
}

async function rest(table, params) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetchWithRetry(url, { headers });
  if (!response.ok) throw new Error(`${table} ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function waitForPreview() {
  let lastError = null;
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    try {
      const response = await fetchWithRetry(`${PREVIEW_BASE}/`, { redirect: 'manual' }, 2);
      if (response.status >= 200 && response.status < 500) {
        console.log(`[preview] ready on attempt ${attempt}: ${response.status}`);
        return;
      }
      lastError = new Error(`preview returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    console.log(`[preview] waiting for deploy preview (${attempt}/18)`);
    await sleep(5000);
  }
  throw new Error(`Deploy preview did not become reachable: ${lastError?.message || 'unknown error'}`);
}

function sectionFor(article, categoriesById, categoriesByName) {
  const topic = String(article.topic_key || '').trim().toLowerCase();
  if (topic === 'trump') return 'trump';
  if (topic === 'ice') return 'ice';
  const byId = categoriesById.get(String(article.category_id || ''));
  if (byId?.slug) return canonicalSection(byId.slug);
  const byName = categoriesByName.get(String(article.category_name || '').trim());
  if (byName?.slug) return canonicalSection(byName.slug);
  return canonicalSection(FALLBACK_CATEGORY_SLUGS.get(String(article.category_name || '').trim()) || 'news');
}

await waitForPreview();

const categories = await rest('categories', {
  select: 'id,name,slug',
  is_active: 'eq.true',
  order: 'id.asc'
});
const categoriesById = new Map(categories.map((row) => [String(row.id || ''), row]));
const categoriesByName = new Map(categories.map((row) => [String(row.name || '').trim(), row]));

const candidates = await rest('articles', {
  select: 'id,title,slug,content,category_id,category_name,topic_key,status,published_at,created_at',
  status: 'eq.published',
  order: 'published_at.desc.nullslast,created_at.desc',
  limit: '100'
});

const article = candidates.find((row) => String(row.id || '').trim() && String(row.slug || '').trim() && String(row.content || '').replace(/\s+/g, ' ').trim().length >= 80);
if (!article) throw new Error('No published article with slug and indexable content was available for preview verification');

const section = sectionFor(article, categoriesById, categoriesByName);
const prettyPath = `/${encodeURIComponent(section)}/${encodeURIComponent(String(article.slug).trim())}`;
const canonical = `${SITE}${prettyPath}`;
const legacyPath = `/article.html?id=${encodeURIComponent(article.id)}`;

const legacyResponse = await fetchWithRetry(`${PREVIEW_BASE}${legacyPath}`, { redirect: 'manual' });
if (legacyResponse.status !== 301) throw new Error(`Legacy URL expected 301, got ${legacyResponse.status}`);
const location = legacyResponse.headers.get('location') || '';
if (location !== canonical) throw new Error(`Legacy redirect mismatch: expected ${canonical}, got ${location}`);
console.log(`[preview] legacy 301 OK: ${legacyPath} -> ${canonical}`);

const prettyResponse = await fetchWithRetry(`${PREVIEW_BASE}${prettyPath}`, { redirect: 'manual' });
if (prettyResponse.status !== 200) throw new Error(`Pretty URL expected 200, got ${prettyResponse.status}`);
const html = await prettyResponse.text();
if (!html.includes(`data-article-id="${article.id}"`)) throw new Error('Pretty URL body is missing the expected article marker');
if (!html.includes(`href="${canonical}"`)) throw new Error('Pretty URL body is missing the production canonical URL');
if (!html.includes('data-trrb-edge-schema')) throw new Error('Pretty URL body is missing edge NewsArticle schema');
console.log(`[preview] pretty 200/canonical/schema OK: ${prettyPath}`);

const sitemapResponse = await fetchWithRetry(`${PREVIEW_BASE}/sitemap-articles-1.xml`, {}, 6);
if (!sitemapResponse.ok) throw new Error(`Article sitemap expected 200, got ${sitemapResponse.status}`);
const sitemap = await sitemapResponse.text();
if (!sitemap.includes('<urlset')) throw new Error('Article sitemap is not a URL set');
if (/\/article\.html\?id=/.test(sitemap)) throw new Error('Article sitemap still contains legacy query URLs');
if (!/https:\/\/trrb\.net\/[^/<]+\/[^<]+/.test(sitemap)) throw new Error('Article sitemap contains no pretty article URL');
console.log('[preview] article sitemap pretty URLs OK');

console.log(`[preview] acceptance sample passed for article ${article.id}`);
