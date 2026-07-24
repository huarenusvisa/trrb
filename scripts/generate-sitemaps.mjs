import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITE = 'https://www.trrb.net';
const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);
const NEWS_CUTOFF = NOW.getTime() - 48 * 60 * 60 * 1000;

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

const canonicalArticleUrl = (article) => {
  if (article?.id) return `${SITE}/article.html?id=${encodeURIComponent(article.id)}`;
  return normalizeUrl(article?.sourceUrl);
};

const parsePublicationDate = (article) => {
  const rawDate = cleanText(article?.date || '');
  const rawTime = cleanText(article?.time || '');
  let value = null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    const timeMatch = rawTime.match(/(?:^|\s)(\d{2}):(\d{2})(?::(\d{2}))?$/);
    value = timeMatch
      ? `${rawDate}T${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3] || '00'}-04:00`
      : `${rawDate}T12:00:00-04:00`;
  }

  const timestamp = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(timestamp)) return null;
  return { value, timestamp, dateOnly: rawDate };
};

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

const staticEntries = [
  { loc: `${SITE}/`, lastmod: TODAY, priority: '1.0', changefreq: 'hourly' },
  { loc: `${SITE}/topic/ice/`, lastmod: TODAY, priority: '0.9', changefreq: 'hourly' },
  { loc: `${SITE}/listing.html?category=${encodeURIComponent('重要新闻')}`, lastmod: TODAY, priority: '0.8', changefreq: 'hourly' },
  { loc: `${SITE}/listing.html?category=${encodeURIComponent('热门头条')}`, lastmod: TODAY, priority: '0.8', changefreq: 'hourly' },
  { loc: `${SITE}/listing.html?category=${encodeURIComponent('驱逐快报')}`, lastmod: TODAY, priority: '0.8', changefreq: 'hourly' },
  { loc: `${SITE}/listing.html?category=${encodeURIComponent('美国时政')}`, lastmod: TODAY, priority: '0.7', changefreq: 'daily' },
  { loc: `${SITE}/listing.html?category=${encodeURIComponent('美国警情')}`, lastmod: TODAY, priority: '0.7', changefreq: 'daily' },
  { loc: `${SITE}/listing.html?category=${encodeURIComponent('中国官场')}`, lastmod: TODAY, priority: '0.7', changefreq: 'daily' },
  { loc: `${SITE}/listing.html?category=${encodeURIComponent('移民美国')}`, lastmod: TODAY, priority: '0.7', changefreq: 'daily' },
  { loc: `${SITE}/listing.html?category=${encodeURIComponent('庇护百科')}`, lastmod: TODAY, priority: '0.7', changefreq: 'daily' }
];

const byUrl = new Map(staticEntries.map((entry) => [entry.loc, entry]));
for (const article of records) {
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
  .filter((entry) => entry.published.timestamp >= NEWS_CUTOFF && entry.published.timestamp <= NOW.getTime() + 5 * 60 * 1000)
  .sort((a, b) => b.published.timestamp - a.published.timestamp)
  .slice(0, 1000);

const newsSitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${recentNews.map(({ loc, article, published }) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <news:news>\n      <news:publication>\n        <news:name>唐人日报</news:name>\n        <news:language>zh-cn</news:language>\n      </news:publication>\n      <news:publication_date>${published.value}</news:publication_date>\n      <news:title>${escapeXml(article.title || '唐人日报新闻')}</news:title>\n    </news:news>\n  </url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(ROOT, 'news-sitemap.xml'), newsSitemap);

console.log(`[sitemap] generated sitemap.xml with ${entries.length} URLs`);
console.log(`[sitemap] generated news-sitemap.xml with ${recentNews.length} recent URLs`);
