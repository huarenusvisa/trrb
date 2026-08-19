#!/usr/bin/env node

const ORIGIN = String(process.env.SITE_ORIGIN || 'https://trrb.net').replace(/\/+$/, '');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const WINDOW_HOURS = 48;
const MIN_BODY = 80;
const SHORT_BODY_MAX = 300;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Supabase credentials are required for ICE breaking-news index audit.');
}

const visibleText = (value = '') => String(value)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&[a-z0-9#]+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

async function fetchRecentIce() {
  const cutoff = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
  url.searchParams.set('select', 'id,title,slug,content,source_url,published_at,created_at,category_name,status,topic_key');
  url.searchParams.set('status', 'eq.published');
  url.searchParams.set('category_name', 'eq.ICE');
  url.searchParams.set('published_at', `gte.${cutoff}`);
  url.searchParams.set('order', 'published_at.desc');
  url.searchParams.set('limit', '500');
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json'
    }
  });
  if (!response.ok) throw new Error(`Supabase ICE query failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  return await response.json();
}

async function fetchNewsSitemap() {
  const response = await fetch(`${ORIGIN}/news-sitemap.xml?ice-audit=${Date.now()}`, {
    headers: {
      'cache-control': 'no-cache',
      'user-agent': 'TRRB-ICE-Breaking-News-Audit/1.1'
    }
  });
  if (!response.ok) throw new Error(`News sitemap fetch failed: ${response.status}`);
  return await response.text();
}

function candidateUrls(article) {
  const id = String(article.id || '').trim();
  const slug = String(article.slug || '').trim() || id;
  const candidates = [];
  if (slug) candidates.push(`${ORIGIN}/ice/${encodeURIComponent(slug)}`);
  if (id) candidates.push(`${ORIGIN}/article.html?id=${encodeURIComponent(id)}`);
  return [...new Set(candidates)];
}

const articles = await fetchRecentIce();
const shortIce = articles
  .map((article) => ({ ...article, bodyLength: visibleText(article.content || '').length }))
  .filter((article) => article.bodyLength >= MIN_BODY && article.bodyLength < SHORT_BODY_MAX);

const xml = await fetchNewsSitemap();
const urls = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim().replace(/&amp;/g, '&')));

const checked = shortIce.map((article) => {
  const candidates = candidateUrls(article);
  const matchedUrl = candidates.find((url) => urls.has(url)) || null;
  return {
    id: article.id,
    title: article.title,
    bodyLength: article.bodyLength,
    sourceUrlPresent: Boolean(String(article.source_url || '').trim()),
    publishedAt: article.published_at || article.created_at || null,
    canonicalCandidates: candidates,
    matchedUrl,
    inNewsSitemap: Boolean(matchedUrl)
  };
});

const missing = checked.filter((item) => !item.inNewsSitemap);
const report = {
  generatedAt: new Date().toISOString(),
  policy: 'ICE breaking-news briefs must not be excluded solely because they are short. Published ICE articles with at least 80 visible characters remain indexable/news-sitemap eligible; quality control should target duplication, factual insufficiency, or unreliable sourcing instead of a 300-word threshold.',
  recentIceCount: articles.length,
  protectedShortIceCount: checked.length,
  missingCount: missing.length,
  sourceUrlCoverage: checked.length ? checked.filter((item) => item.sourceUrlPresent).length / checked.length : null,
  missing,
  sample: checked.slice(0, 25)
};

await import('node:fs').then(({ writeFileSync }) => {
  writeFileSync('ice-breaking-news-index-audit.json', `${JSON.stringify(report, null, 2)}\n`);
});

console.log(`ICE breaking-news audit: recent=${articles.length}; shortProtected=${checked.length}; missing=${missing.length}`);
if (missing.length) {
  console.error('FAIL: one or more legitimate short ICE breaking-news articles are missing from Google News sitemap. Do not exclude ICE briefs solely by length.');
  process.exit(1);
}
console.log('PASS: short ICE breaking-news articles remain eligible for news indexing.');
