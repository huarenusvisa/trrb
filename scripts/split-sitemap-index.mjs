import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITE = 'https://trrb.net';
const sourcePath = path.join(ROOT, 'sitemap.xml');
const xml = fs.readFileSync(sourcePath, 'utf8');

if (!xml.includes('<urlset')) {
  throw new Error('sitemap.xml is not a URL set');
}

const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) || [];
const staticBlocks = [];
const articleBlocks = [];
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

for (const block of blocks) {
  if (isArticleBlock(block)) articleBlocks.push(block);
  else staticBlocks.push(block);
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

console.log(`[sitemap-index] ${blocks.length} URLs split into ${files.length} files (${staticBlocks.length} static, ${articleBlocks.length} articles)`);
