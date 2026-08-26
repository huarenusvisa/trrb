import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const SITE = 'https://trrb.net';
const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);
const NEWS_CUTOFF = NOW.getTime() - 48 * 60 * 60 * 1000;
const MIN_INDEXABLE_BODY_LENGTH = 80;
const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!base || !key) {
  throw new Error('Supabase credentials are required to build production sitemaps. Static WordPress-era archives are no longer an indexing source.');
}

const STATIC_HUBS = [
  { loc: `${SITE}/immigrate/`, priority: '0.8', changefreq: 'weekly' },
  { loc: `${SITE}/legal/`, priority: '0.8', changefreq: 'daily' },
  { loc: `${SITE}/ershou/`, priority: '0.8', changefreq: 'daily' }
];

function loadImmigrationKnowledgeEntries() {
  const configPath = path.join(ROOT, 'config/immigration-knowledge.js');
  const source = fs.readFileSync(configPath, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: configPath, timeout: 1000 });
  const config = sandbox.window.TRRB_IMMIGRATION_KNOWLEDGE;
  const categories = Array.isArray(config?.categories) ? config.categories : [];
  if (!categories.length) {
    throw new Error('Immigration knowledge config has no categories; refusing to publish an incomplete sitemap.');
  }

  const entries = [];
  const seen = new Set();
  for (const category of categories) {
    const categorySlug = String(category?.slug || '').trim();
    if (!categorySlug) continue;
    const categoryLoc = `${SITE}/immigrate/center?path=${encodeURIComponent(categorySlug)}`;
    if (!seen.has(categoryLoc)) {
      seen.add(categoryLoc);
      entries.push({ loc: categoryLoc, priority: '0.7', changefreq: 'weekly' });
    }
    for (const topic of Array.isArray(category?.items) ? category.items : []) {
      const topicSlug = String(topic?.slug || '').trim();
      if (!topicSlug) continue;
      const topicLoc = `${categoryLoc}&topic=${encodeURIComponent(topicSlug)}`;
      if (seen.has(topicLoc)) continue;
      seen.add(topicLoc);
      entries.push({ loc: topicLoc, priority: '0.6', changefreq: 'weekly' });
    }
  }
  if (!entries.length) {
    throw new Error('Immigration knowledge config produced zero indexable URLs.');
  }
  return entries;
}

const IMMIGRATION_KNOWLEDGE_ENTRIES = loadImmigrationKnowledgeEntries();

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
  ['ICE执法', 'ice']
]);
const SECTION_ALIASES = new Map([
  ['important', 'important-news'],
  ['hot', 'hot-headlines'],
  ['politics', 'us-politics'],
  ['crime', 'us-crime'],
  ['china', 'china-officialdom']
]);

const cleanText = (value = '') => String(value)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim();
const canonicalSection = (value = '') => SECTION_ALIASES.get(cleanText(value)) || cleanText(value);
const visibleText = (value = '') => cleanText(value)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&[a-z0-9#]+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const normalizedTitle = (value = '') => visibleText(value).toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '');
const isIceArticle = (article) => {
  const topic = cleanText(article?.topic_key || '').toLowerCase();
  const category = cleanText(article?.category_name || '');
  return topic === 'ice' || category === 'ICE执法动态' || category === 'ICE执法';
};
const isSpecialTopicArticle = (article) => {
  const topic = cleanText(article?.topic_key || '').toLowerCase();
  return topic === 'ice' || topic === 'trump';
};
const isIndexableArticle = (article) => {
  const body = visibleText(article?.content || article?.summary || '');
  if (isIceArticle(article)) return Boolean(cleanText(article?.title || '')) && Boolean(body);
  return body.length >= MIN_INDEXABLE_BODY_LENGTH;
};
const escapeXml = (value = '') => cleanText(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

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
  return null;
};

async function rest(pathname, params) {
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
  const pageSize = 1000;
  const maxPages = 100;
  const all = [];
  for (let page = 0; page < maxPages; page += 1) {
    const rows = await rest('articles', {
      select: 'id,title,slug,summary,content,category_id,category_name,topic_key,status,published_at,created_at,source_url,cover_image',
      status: 'eq.published',
      order: 'published_at.asc.nullslast,created_at.asc',
      limit: String(pageSize),
      offset: String(page * pageSize)
    });
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

const categories = await fetchCategories();
const categoriesById = new Map(categories.map((row) => [String(row.id || ''), row]));
const categoriesByName = new Map(categories.map((row) => [cleanText(row.name || ''), row]));

function articleSection(article) {
  const topic = cleanText(article?.topic_key || '').toLowerCase();
  if (topic === 'trump') return 'trump';
  if (topic === 'ice') return 'ice';
  const byId = categoriesById.get(String(article?.category_id || ''));
  if (byId?.slug) return canonicalSection(byId.slug);
  const byName = categoriesByName.get(cleanText(article?.category_name || ''));
  if (byName?.slug) return canonicalSection(byName.slug);
  return FALLBACK_CATEGORY_SLUGS.get(cleanText(article?.category_name || '')) || 'news';
}

function canonicalArticleUrl(article) {
  const slug = cleanText(article?.slug || '') || cleanText(article?.id || '');
  if (!slug) return null;
  return `${SITE}/${encodeURIComponent(articleSection(article))}/${encodeURIComponent(slug)}`;
}

const categoryUrl = (category) => `${SITE}/${encodeURIComponent(canonicalSection(category?.slug || ''))}`;

if (categories.length) {
  const specialRoutes = [
    '/ice /topic/ice/live-v6.html 200!',
    '/ice/ /topic/ice/live-v6.html 200!',
    `/ice/news /listing.html?category=${encodeURIComponent('ICE执法动态')} 200!`,
    `/ice/news/ /listing.html?category=${encodeURIComponent('ICE执法动态')} 200!`,
    '/topic/ice /topic/ice/live-v6.html 200!',
    '/topic/ice/ /topic/ice/live-v6.html 200!'
  ];
  const categoryRoutes = categories
    .filter((item) => cleanText(item.slug) && cleanText(item.name) && canonicalSection(item.slug).toLowerCase() !== 'ice')
    .map((item) => `/${canonicalSection(item.slug)} /listing.html?category=${encodeURIComponent(cleanText(item.name))} 200`);
  fs.writeFileSync(path.join(ROOT, '_redirects'), `${[...specialRoutes, ...categoryRoutes].join('\n')}\n`);
  console.log(`[routes] generated ${categoryRoutes.length} category rewrites plus ICE dashboard routes`);
}

const sitemapCategoryIds = new Set(categories.filter((item) => item.include_in_sitemap !== false).map((item) => String(item.id)));
const sitemapCategoryNames = new Set(categories.filter((item) => item.include_in_sitemap !== false).map((item) => String(item.name)));
const newsCategoryIds = new Set(categories.filter((item) => item.include_in_google_news !== false).map((item) => String(item.id)));
const newsCategoryNames = new Set(categories.filter((item) => item.include_in_google_news !== false).map((item) => String(item.name)));

const databaseArticles = await fetchAllPublishedArticles();
console.log(`[sitemap] loaded ${databaseArticles.length} live published articles from Supabase`);
if (!databaseArticles.length) {
  throw new Error('No published database articles were returned; refusing to publish an empty/stale sitemap');
}

const staticEntries = [
  { loc: `${SITE}/`, lastmod: TODAY, priority: '1.0', changefreq: 'hourly' },
  ...STATIC_HUBS.map((entry) => ({ ...entry, lastmod: TODAY })),
  ...IMMIGRATION_KNOWLEDGE_ENTRIES.map((entry) => ({ ...entry, lastmod: TODAY }))
];
if (categories.length) {
  for (const category of categories.filter((item) => item.include_in_sitemap !== false && cleanText(item.slug))) {
    staticEntries.push({ loc: categoryUrl(category), lastmod: TODAY, priority: '0.8', changefreq: 'hourly' });
  }
  if (!staticEntries.some((entry) => entry.loc === `${SITE}/trump`)) {
    staticEntries.push({ loc: `${SITE}/trump`, lastmod: TODAY, priority: '0.8', changefreq: 'hourly' });
  }
  staticEntries.push({ loc: `${SITE}/ice/news`, lastmod: TODAY, priority: '0.7', changefreq: 'hourly' });
} else {
  [...FALLBACK_CATEGORY_SLUGS.values()].forEach((slug) => staticEntries.push({
    loc: `${SITE}/${slug}`,
    lastmod: TODAY,
    priority: '0.7',
    changefreq: 'daily'
  }));
  staticEntries.push({ loc: `${SITE}/trump`, lastmod: TODAY, priority: '0.8', changefreq: 'hourly' });
}

const isAllowed = (article, idSet, nameSet) => {
  if (isSpecialTopicArticle(article)) return true;
  if (!categories.length) return true;
  if (article?.category_id) return idSet.has(String(article.category_id));
  if (article?.category_name) return nameSet.has(String(article.category_name));
  return true;
};

const byUrl = new Map(staticEntries.map((entry) => [entry.loc, entry]));
const seenTitles = new Set();
const seenBodies = new Set();
let thinExcluded = 0;
let shortIcePreserved = 0;
let specialTopicPreserved = 0;
let duplicateExcluded = 0;
for (const article of databaseArticles) {
  if (!article?.id || !cleanText(article?.title)) continue;
  if (!isAllowed(article, sitemapCategoryIds, sitemapCategoryNames)) continue;
  if (isSpecialTopicArticle(article)) specialTopicPreserved += 1;

  const body = visibleText(article?.content || article?.summary || '');
  if (!isIndexableArticle(article)) {
    thinExcluded += 1;
    continue;
  }
  if (isIceArticle(article) && body.length < MIN_INDEXABLE_BODY_LENGTH) shortIcePreserved += 1;

  const titleKey = normalizedTitle(article?.title || '');
  const bodyKey = body.length >= 120 ? body : '';
  if ((titleKey.length >= 8 && seenTitles.has(titleKey)) || (bodyKey && seenBodies.has(bodyKey))) {
    duplicateExcluded += 1;
    continue;
  }
  if (titleKey.length >= 8) seenTitles.add(titleKey);
  if (bodyKey) seenBodies.add(bodyKey);

  const loc = canonicalArticleUrl(article);
  if (!loc) continue;
  const published = parsePublicationDate(article);
  const date = published?.dateOnly || TODAY;
  byUrl.set(loc, { loc, lastmod: date, priority: '0.6', changefreq: 'weekly', article, published });
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

if (recentNews.length === 0 && (!categories.length || newsCategoryNames.size > 0 || newsCategoryIds.size > 0)) {
  console.warn('[sitemap] no articles qualified for the 48-hour Google News sitemap');
}

const newsSitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${recentNews.map(({ loc, article, published }) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <news:news>\n      <news:publication><news:name>唐人日报</news:name><news:language>zh-cn</news:language></news:publication>\n      <news:publication_date>${published.value}</news:publication_date>\n      <news:title>${escapeXml(article.title || '唐人日报新闻')}</news:title>\n    </news:news>\n  </url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(ROOT, 'news-sitemap.xml'), newsSitemap);
console.log(`[sitemap] generated ${entries.length} canonical URLs; static hubs ${STATIC_HUBS.length}; immigration knowledge ${IMMIGRATION_KNOWLEDGE_ENTRIES.length}; news ${recentNews.length}; categories ${categories.length}; excluded thin ${thinExcluded}; preserved short ICE ${shortIcePreserved}; preserved special topic ${specialTopicPreserved}; excluded duplicate ${duplicateExcluded}`);
