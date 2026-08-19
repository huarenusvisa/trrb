import fs from 'node:fs';
import path from 'node:path';

// Every Netlify build path, including Build Hook deployments, runs this assurance
// step. Stamp the exact checkout revision before SEO validation so production can
// prove which main commit is actually serving traffic.
await import('./write-deploy-version.mjs');

const ROOT = process.cwd();
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const NEWS_SITEMAP = path.join(ROOT, 'news-sitemap.xml');

if (!fs.existsSync(SITEMAP)) throw new Error('sitemap.xml missing before assurance');
if (!fs.existsSync(NEWS_SITEMAP)) throw new Error('news-sitemap.xml missing before assurance');

function decodeXml(value = '') {
  return String(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .trim();
}

function locs(xml) {
  return [...String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((m) => decodeXml(m[1])).filter(Boolean);
}

function isArticleLoc(loc) {
  try {
    const url = new URL(loc);
    if (!['trrb.net', 'www.trrb.net'].includes(url.hostname)) return false;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 2) return false;
    const [section, slug] = parts;
    if (!section || !slug) return false;
    if (section === 'ice' && slug === 'news') return false;
    return true;
  } catch {
    return false;
  }
}

const sitemapXml = fs.readFileSync(SITEMAP, 'utf8');
const newsXml = fs.readFileSync(NEWS_SITEMAP, 'utf8');
if (!/<urlset\b/i.test(sitemapXml)) throw new Error('sitemap.xml is not a urlset');
if (!/<urlset\b/i.test(newsXml)) throw new Error('news-sitemap.xml is not a urlset');

const sitemapLocs = locs(sitemapXml);
const newsLocs = locs(newsXml);
const legacySitemapLocs = sitemapLocs.filter((loc) => /\/article\.html\?id=/i.test(loc));
const legacyNewsLocs = newsLocs.filter((loc) => /\/article\.html\?id=/i.test(loc));
const articleLocs = sitemapLocs.filter(isArticleLoc);

if (legacySitemapLocs.length || legacyNewsLocs.length) {
  throw new Error(`Generated SEO feeds still contain legacy article URLs: sitemap=${legacySitemapLocs.length}; news=${legacyNewsLocs.length}`);
}
if (articleLocs.length < 10) {
  throw new Error(`Generated sitemap has too few canonical article URLs: ${articleLocs.length}`);
}

// IMPORTANT: this step intentionally does not add articles. generate-sitemaps.mjs
// is the single authority for thin-content, ICE-short-brief and duplicate rules.
// Re-adding every published row here used to undo those filters.
console.log(`[sitemap-assure] canonical articles=${articleLocs.length}; news=${newsLocs.length}; legacy=0; non-mutating validation PASS`);
