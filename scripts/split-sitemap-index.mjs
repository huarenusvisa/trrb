import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITE = 'https://trrb.net';
const sourcePath = path.join(ROOT, 'sitemap.xml');
const xml = fs.readFileSync(sourcePath, 'utf8');

if (!xml.includes('<urlset')) {
  throw new Error('sitemap.xml is not a URL set');
}

function expectedImmigrationKnowledgeUrls() {
  const configSource = fs.readFileSync(path.join(ROOT, 'config/immigration-knowledge.js'), 'utf8');
  const sharedEdgeSource = fs.readFileSync(path.join(ROOT, 'netlify/edge-functions/_shared/immigration-knowledge-routes.ts'), 'utf8');
  const seoEdgeSource = fs.readFileSync(path.join(ROOT, 'netlify/edge-functions/seo-route-meta.ts'), 'utf8');
  const sandboxWindow = {};
  new Function('window', configSource)(sandboxWindow);
  const categories = Array.isArray(sandboxWindow.TRRB_IMMIGRATION_KNOWLEDGE?.categories)
    ? sandboxWindow.TRRB_IMMIGRATION_KNOWLEDGE.categories
    : [];
  if (!categories.length) throw new Error('Immigration knowledge config has no categories');
  if (!seoEdgeSource.includes('./_shared/immigration-knowledge-routes.ts')) {
    throw new Error('SEO route metadata is not using the shared immigration route table');
  }
  if (/IMMIGRATION_PATHS|IMMIGRATION_TOPICS/.test(seoEdgeSource)) {
    throw new Error('SEO route metadata reintroduced a duplicate immigration route table');
  }

  const urls = [];
  const clientSet = new Set();
  for (const category of categories) {
    const categorySlug = String(category?.slug || '').trim();
    if (!categorySlug) continue;
    if (!sharedEdgeSource.includes(`slug: "${categorySlug}"`)) {
      throw new Error(`Immigration Edge canonical table is missing category slug: ${categorySlug}`);
    }

    const categoryUrl = `${SITE}/immigrate/center?path=${encodeURIComponent(categorySlug)}`;
    urls.push(categoryUrl);
    clientSet.add(`/immigrate/center?path=${categorySlug}`);
    for (const topic of Array.isArray(category?.items) ? category.items : []) {
      const topicSlug = String(topic?.slug || '').trim();
      if (!topicSlug) continue;
      if (!sharedEdgeSource.includes(`["${topicSlug}",`)) {
        throw new Error(`Immigration Edge canonical table is missing topic slug: ${categorySlug}/${topicSlug}`);
      }
      urls.push(`${categoryUrl}&topic=${encodeURIComponent(topicSlug)}`);
      clientSet.add(`/immigrate/center?path=${categorySlug}&topic=${topicSlug}`);
    }
  }

  const sharedSet = new Set();
  const categoryPattern = /\{\s*slug:\s*"([^"]+)"[\s\S]*?topics:\s*\[([\s\S]*?)\]\.map\(\(\[slug, name\]\)/g;
  let categoryMatch;
  while ((categoryMatch = categoryPattern.exec(sharedEdgeSource))) {
    const categorySlug = categoryMatch[1];
    sharedSet.add(`/immigrate/center?path=${categorySlug}`);
    const topicPattern = /\["([^"]+)",\s*"[^"]+"\]/g;
    let topicMatch;
    while ((topicMatch = topicPattern.exec(categoryMatch[2]))) {
      sharedSet.add(`/immigrate/center?path=${categorySlug}&topic=${topicMatch[1]}`);
    }
  }
  const missingFromEdge = [...clientSet].filter((route) => !sharedSet.has(route));
  const missingFromClient = [...sharedSet].filter((route) => !clientSet.has(route));
  if (missingFromEdge.length || missingFromClient.length || clientSet.size !== sharedSet.size) {
    throw new Error(`Immigration knowledge route drift: missingFromEdge=${missingFromEdge.join('|') || 'none'}; missingFromClient=${missingFromClient.join('|') || 'none'}; client=${clientSet.size}; edge=${sharedSet.size}`);
  }

  return [...new Set(urls)];
}

const expectedKnowledgeUrls = expectedImmigrationKnowledgeUrls();
for (const url of expectedKnowledgeUrls) {
  const escaped = url.replaceAll('&', '&amp;');
  if (!xml.includes(`<loc>${escaped}</loc>`)) {
    throw new Error(`sitemap.xml is missing immigration knowledge URL: ${url}`);
  }
}
if (/https:\/\/trrb\.net\/immigrate\/center\.html(?:\?|<)/i.test(xml)) {
  throw new Error('sitemap.xml must use clean /immigrate/center canonical URLs, not center.html');
}

const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
const staticBlocks = [];
const articleBlocks = [];
let forbiddenStaticExcluded = 0;
const RESERVED_FIRST_SEGMENTS = new Set(['topic', 'immigrate', 'assets', 'admin', 'data', 'netlify', '.netlify', 'wp-content']);

function isArticleBlock(block) {
  if (/\/article\.html\?id=/.test(block)) return true;
  const match = block.match(/<loc>https:\/\/trrb\.net\/([^<]+)<\/loc>/i);
  if (!match) return false;
  const pathname = String(match[1] || '').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length !== 2) return false;
  const [section, slug] = parts;
  if (!section || !slug || RESERVED_FIRST_SEGMENTS.has(section.toLowerCase())) return false;
  if (section.toLowerCase() === 'ice' && slug.toLowerCase() === 'news') return false;
  if (/\.[a-z0-9]{1,8}$/i.test(slug)) return false;
  return true;
}

function isForbiddenStaticBlock(block) {
  // Recruitment is a launched, indexable product and must stay sitemap-eligible.
  // Finance remains prelaunch/noindex; People is retired; expose is utility-only.
  return /<loc>https:\/\/trrb\.net\/(?:finance(?:\/|\?|<)|people(?:\/|\?|<)|expose(?:\/?(?:\?|<)))/i.test(block);
}

for (const block of blocks) {
  if (isForbiddenStaticBlock(block)) {
    forbiddenStaticExcluded += 1;
    continue;
  }
  if (isArticleBlock(block)) articleBlocks.push(block);
  else staticBlocks.push(block);
}

if ([...staticBlocks, ...articleBlocks].some(isForbiddenStaticBlock)) {
  throw new Error('Noindex/prelaunch routes leaked into the published sitemap');
}

for (const name of fs.readdirSync(ROOT)) {
  if (/^sitemap-(?:static|articles-\d+)\.xml$/.test(name)) {
    fs.rmSync(path.join(ROOT, name), { force: true });
  }
}

function writeUrlset(filename, items) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, filename), body);
}

const files = [];
if (staticBlocks.length) {
  writeUrlset('sitemap-static.xml', staticBlocks);
  files.push('sitemap-static.xml');
}

const CHUNK_SIZE = 5000;
for (let start = 0, index = 1; start < articleBlocks.length; start += CHUNK_SIZE, index += 1) {
  const filename = `sitemap-articles-${index}.xml`;
  writeUrlset(filename, articleBlocks.slice(start, start + CHUNK_SIZE));
  files.push(filename);
}

const today = new Date().toISOString().slice(0, 10);
const indexXml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files.map((filename) => `  <sitemap>\n    <loc>${SITE}/${filename}</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`).join('\n')}\n</sitemapindex>\n`;
fs.writeFileSync(sourcePath, indexXml);

console.log(`[sitemap-index] ${blocks.length} URLs split into ${files.length} files (${staticBlocks.length} static, ${articleBlocks.length} articles); immigration knowledge ${expectedKnowledgeUrls.length}/${expectedKnowledgeUrls.length} edge-aligned; forbidden static excluded ${forbiddenStaticExcluded}`);
