import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITE = 'https://www.trrb.net';
const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);
const NEWS_CUTOFF = NOW.getTime() - 48 * 60 * 60 * 1000;
const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const cleanText = (value = '') => String(value)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim();
const escapeXml = (value = '') => cleanText(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const normalizeUrl = (raw) => {
  if (!raw) return null;
  try {
    const url = new URL(raw, SITE);
    if (!['trrb.net', 'www.trrb.net'].includes(url.hostname)) return null;
    url.protocol = 'https:';
    url.hostname = 'www.trrb.net';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
};

const canonicalArticleUrl = (article) => article?.id
  ? `${SITE}/article.html?id=${encodeURIComponent(article.id)}`
  : normalizeUrl(article?.sourceUrl || article?.source_url);
const categoryUrl = (category) => `${SITE}/${encodeURIComponent(cleanText(category?.slug || ''))}`;

const parsePublicationDate = (article) => {
  const iso = cleanText(article?.published_at || article?.created_at || '');
  if (iso) {
    const timestamp = Date.parse(iso);
    if (Number.isFinite(timestamp)) {
      return {
        value: new Date(timestamp).toISOString(),
        timestamp,
        dateOnly: new Date(timestamp).toISOString().slice(0, 10)
      };
    }
  }
  const rawDate = cleanText(article?.date || '');
  const rawTime = cleanText(article?.time || '');
  let value = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    const match = rawTime.match(/(?:^|\s)(\d{2}):(\d{2})(?::(\d{2}))?$/);
    value = match
      ? `${rawDate}T${match[1]}:${match[2]}:${match[3] || '00'}-04:00`
      : `${rawDate}T12:00:00-04:00`;
  }
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp)
    ? { value: new Date(timestamp).toISOString(), timestamp, dateOnly: rawDate }
    : null;
};

async function rest(pathname, params) {
  if (!base || !key) return [];
  const url = new URL(`${base}/rest/v1/${pathname}`);
  Object.entries(params || {}).forEach(([name, value]) => url.searchParams.set(name, value));
  const response = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`${pathname} query failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function fetchCategories() {
  try {
    return await rest('categories', {
      select: 'id,name,slug,is_active,sort_order,include_in_sitemap,include_in_google_news',
      is_active: 'eq.true',
      order: 'sort_order.asc'
    });
  } catch (error) {
    console.warn(`[sitemap] category CMS unavailable: ${error.message}`);
    return [];
  }
}

async function fetchAllPublishedArticles() {
  if (!base || !key) {
    console.warn('[sitemap] Supabase unavailable; using static chunks');
    return [];
  }
  const pageSize = 1000;
  const maxPages = 50;
  const all = [];
  for (let page = 0; page < maxPages; page += 1) {
    const rows = await rest('articles', {
      select: 'id,title,summary,category_id,category_name,status,published_at,created_at,source_url,cover_image',
      status: 'eq.published',
      order: 'published_at.desc.nullslast,created_at.desc',
      limit: String(pageSize),
      offset: String(page * pageSize)
    });
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

const categories = await fetchCategories();
if (categories.length) {
  const specialRoutes = [
    '/ice /topic/ice/live-v6.html 200!',
    '/ice/ /topic/ice/live-v6.html 200!',
    '/ice/news /listing.html?category=ICE 200!',
    '/ice/news/ /listing.html?category=ICE 200!',
    '/topic/ice /topic/ice/live-v6.html 200!',
    '/topic/ice/ /topic/ice/live-v6.html 200!'
  ];
  const categoryRoutes = categories
    .filter((item) => cleanText(item.slug) && cleanText(item.name) && cleanText(item.slug).toLowerCase() !== 'ice')
    .map((item) => `/${cleanText(item.slug)} /listing.html?category=${encodeURIComponent(cleanText(item.name))} 200`);
  fs.writeFileSync(path.join(ROOT, '_redirects'), `${[...specialRoutes, ...categoryRoutes].join('\n')}\n`);
  console.log(`[routes] generated ${categoryRoutes.length} category rewrites plus ICE dashboard routes`);
}

const sitemapCategoryIds = new Set(categories.filter((item) => item.include_in_sitemap !== false).map((item) => String(item.id)));
const sitemapCategoryNames = new Set(categories.filter((item) => item.include_in_sitemap !== false).map((item) => String(item.name)));
const newsCategoryIds = new Set(categories.filter((item) => item.include_in_google_news !== false).map((item) => String(item.id)));
const newsCategoryNames = new Set(categories.filter((item) => item.include_in_google_news !== false).map((item) => String(item.name)));

const records = [];
for (const name of fs.readdirSync(ROOT)) {
  if (!/^articles-chunk-\d+\.js$/.test(name)) continue;
  try {
    const text = fs.readFileSync(path.join(ROOT, name), 'utf8');
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start) continue;
    const items = JSON.parse(text.slice(start, end + 1));
    if (Array.isArray(items)) records.push(...items);
  } catch (error) {
    console.warn(`[sitemap] skipped ${name}: ${error.message}`);
  }
}

let databaseArticles = [];
try {
  databaseArticles = await fetchAllPublishedArticles();
  records.push(...databaseArticles);
  console.log(`[sitemap] loaded ${databaseArticles.length} published articles`);
} catch (error) {
  console.error(`[sitemap] ${error.message}`);
  throw error;
}

const staticEntries = [{ loc: `${SITE}/`, lastmod: TODAY, priority: '1.0', changefreq: 'hourly' }];
if (categories.length) {
  for (const category of categories.filter((item) => item.include_in_sitemap !== false && cleanText(item.slug))) {
    staticEntries.push({ loc: categoryUrl(category), lastmod: TODAY, priority: '0.8', changefreq: 'hourly' });
  }
  staticEntries.push({ loc: `${SITE}/ice/news`, lastmod: TODAY, priority: '0.7', changefreq: 'hourly' });
} else {
  ['重要新闻', '热门头条', '驱逐快报', '美国时政', '美国警情', '中国官场', '移民美国', '庇护百科']
    .forEach((name) => staticEntries.push({
      loc: `${SITE}/listing.html?category=${encodeURIComponent(name)}`,
      lastmod: TODAY,
      priority: '0.7',
      changefreq: 'daily'
    }));
}

const isAllowed = (article, idSet, nameSet) => {
  if (!categories.length) return true;
  if (article?.category_id) return idSet.has(String(article.category_id));
  if (article?.category_name) return nameSet.has(String(article.category_name));
  return true;
};

const byUrl = new Map(staticEntries.map((entry) => [entry.loc, entry]));
for (const article of records) {
  if (!isAllowed(article, sitemapCategoryIds, sitemapCategoryNames)) continue;
  const loc = canonicalArticleUrl(article);
  if (!loc) continue;
  const published = parsePublicationDate(article);
  const date = published?.dateOnly || TODAY;
  const existing = byUrl.get(loc);
  if (!existing || date > existing.lastmod) {
    byUrl.set(loc, { loc, lastmod: date, priority: '0.6', changefreq: 'weekly', article, published });
  }
}

const entries = [...byUrl.values()].sort((a, b) => b.lastmod.localeCompare(a.lastmod));
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(({ loc, lastmod, changefreq, priority }) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);

const recentNews = entries
  .filter((entry) => entry.article && entry.published)
  .filter((entry) => isAllowed(entry.article, newsCategoryIds, newsCategoryNames))
  .filter((entry) => entry.published.timestamp >= NEWS_CUTOFF && entry.published.timestamp <= NOW.getTime() + 5 * 60 * 1000)
  .filter((entry) => cleanText(entry.article?.title || '').length > 0)
  .sort((a, b) => b.published.timestamp - a.published.timestamp)
  .slice(0, 1000);

if (databaseArticles.length > 0 && recentNews.length === 0 && (!categories.length || newsCategoryNames.size > 0 || newsCategoryIds.size > 0)) {
  throw new Error('Published articles loaded but news sitemap would be empty');
}

const newsSitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${recentNews.map(({ loc, article, published }) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <news:news>\n      <news:publication><news:name>唐人日报</news:name><news:language>zh-cn</news:language></news:publication>\n      <news:publication_date>${published.value}</news:publication_date>\n      <news:title>${escapeXml(article.title || '唐人日报新闻')}</news:title>\n    </news:news>\n  </url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(ROOT, 'news-sitemap.xml'), newsSitemap);
console.log(`[sitemap] generated ${entries.length} URLs; news ${recentNews.length}; categories ${categories.length}`);
