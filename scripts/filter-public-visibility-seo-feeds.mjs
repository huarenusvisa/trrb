import fs from 'node:fs';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Supabase credentials are required to enforce public visibility on SEO feeds.');
}

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  Accept: 'application/json'
};

async function fetchPublishedVisibility() {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/articles`);
    url.searchParams.set('select', 'id,slug,visibility,status');
    url.searchParams.set('status', 'eq.published');
    url.searchParams.set('order', 'id.asc');
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, { headers, cache: 'no-store' });
    if (!response.ok) throw new Error(`articles visibility query failed: ${response.status} ${(await response.text()).slice(0, 240)}`);
    const batch = await response.json();
    if (!Array.isArray(batch)) break;
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

function decodeXml(value = '') {
  return String(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .trim();
}

function decodeSegment(value = '') {
  try { return decodeURIComponent(value); } catch { return value; }
}

function articleKeyFromUrl(raw = '') {
  try {
    const url = new URL(decodeXml(raw));
    const queryId = String(url.searchParams.get('id') || '').trim();
    if (queryId) return queryId;
    const parts = url.pathname.split('/').filter(Boolean);
    return decodeSegment(parts.at(-1) || '');
  } catch {
    return '';
  }
}

function extractBlockUrl(block = '') {
  const loc = block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1];
  if (loc) return loc;
  const link = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1];
  return link || '';
}

const published = await fetchPublishedVisibility();
const blocked = new Set();
for (const row of published) {
  if (String(row?.visibility || '').trim() === 'public') continue;
  const id = String(row?.id || '').trim();
  const slug = String(row?.slug || '').trim();
  if (id) blocked.add(id);
  if (slug) blocked.add(slug);
}

const files = [
  { path: 'sitemap.xml', block: /<url>[\s\S]*?<\/url>/gi },
  { path: 'news-sitemap.xml', block: /<url>[\s\S]*?<\/url>/gi },
  { path: 'feed.xml', block: /<item>[\s\S]*?<\/item>/gi }
];

let totalRemoved = 0;
for (const { path, block } of files) {
  if (!fs.existsSync(path)) continue;
  const before = fs.readFileSync(path, 'utf8');
  let removed = 0;
  const after = before.replace(block, (entry) => {
    const key = articleKeyFromUrl(extractBlockUrl(entry));
    if (!key || !blocked.has(key)) return entry;
    removed += 1;
    return '';
  });
  if (removed) fs.writeFileSync(path, after);
  totalRemoved += removed;
  console.log(`[visibility-filter] ${path}: removed=${removed}`);

  for (const key of blocked) {
    if (!key) continue;
    const encoded = encodeURIComponent(key);
    if (after.includes(`/${key}</`) || after.includes(`/${encoded}</`) || after.includes(`id=${key}`) || after.includes(`id=${encoded}`)) {
      throw new Error(`${path} still contains a nonpublic published article: ${key}`);
    }
  }
}

console.log(`[visibility-filter] published=${published.length}; nonpublic keys=${blocked.size}; removed=${totalRemoved}; PASS`);
