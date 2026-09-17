import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'https://chinesebooks.github.io/xiandai/';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'data', 'library');
const BOOKS_OUT = path.join(OUT, 'books');
const COVERS_OUT = path.join(ROOT, 'assets', 'library-covers');
const CONCURRENCY = Math.max(1, Math.min(16, Number(process.env.LIBRARY_SYNC_CONCURRENCY || 10)));
const CATALOG_ONLY = process.argv.includes('--catalog-only');
const USER_AGENT = 'TangRenDaily-LibraryMirror/1.0 (+https://trrb.net/library/)';

function decode(value = '') {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(value)
    .replace(/&#(x?[0-9a-f]+);/gi, (_, raw) => String.fromCodePoint(parseInt(raw.replace(/^x/i, ''), /^x/i.test(raw) ? 16 : 10)))
    .replace(/&([a-z]+);/gi, (all, name) => named[name.toLowerCase()] ?? all);
}

function text(value = '') {
  return decode(String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function attr(tag, name) {
  const match = String(tag).match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match ? decode(match[1].trim()) : '';
}

function absolute(href, base = SOURCE) {
  try { return new URL(href, base).href; } catch { return ''; }
}

function safeSource(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'chinesebooks.github.io';
  } catch { return false; }
}

function slugFor(url) {
  const pathname = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
  return pathname.replace(/^xiandai\//, '').replace(/[^a-z0-9]+/gi, '--').replace(/^-+|-+$/g, '').toLowerCase();
}

async function fetchText(url, attempt = 1) {
  if (!safeSource(url)) throw new Error(`Blocked source URL: ${url}`);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    if (attempt >= 3) throw new Error(`${url}: ${error.message}`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    return fetchText(url, attempt + 1);
  }
}

async function pool(items, worker, limit = CONCURRENCY) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await worker(items[index], index); }
      catch (error) { results[index] = { error: error.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, run));
  return results;
}

function parseCatalog(html) {
  const block = html.match(/<ul\b[^>]*class=["'][^"']*booklist[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || '';
  const books = [];
  for (const match of block.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const item = match[1];
    const link = [...item.matchAll(/<a\b[^>]*class=["'][^"']*text[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)][0];
    if (!link) continue;
    const tag = link[0].match(/<a\b[^>]*>/i)?.[0] || '';
    const sourceUrl = absolute(attr(tag, 'href'));
    if (!sourceUrl || !safeSource(sourceUrl)) continue;
    const imageTag = item.match(/<img\b[^>]*>/i)?.[0] || '';
    books.push({
      slug: slugFor(sourceUrl),
      title: text(link[1]),
      cover: absolute(attr(imageTag, 'src')),
      source_url: sourceUrl,
    });
  }
  return [...new Map(books.map((book) => [book.source_url, book])).values()];
}

function parseBook(html, seed) {
  const title = text(html.match(/<h2\b[^>]*class=["'][^"']*articleH22[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i)?.[1] || seed.title);
  const description = text(html.match(/<p\b[^>]*class=["'][^"']*des[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || '');
  const bookBlock = html.match(/<div\b[^>]*class=["'][^"']*bookDes[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class=["'][^"']*kind/i)?.[1] || '';
  const coverTag = bookBlock.match(/<img\b[^>]*>/i)?.[0] || '';
  const indexBlock = html.match(/<div\b[^>]*class=["'][^"']*index_list[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const chapters = [];
  for (const match of indexBlock.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const sourceUrl = absolute(attr(`<a ${match[1]}>`, 'href'), seed.source_url);
    if (!sourceUrl || !safeSource(sourceUrl)) continue;
    chapters.push({ title: text(match[2]), source_url: sourceUrl, kind: /\.html(?:$|[?#])/i.test(sourceUrl) ? 'chapter' : 'collection' });
  }
  return { ...seed, title, description, cover: absolute(attr(coverTag, 'src'), seed.source_url) || seed.cover, chapters };
}

function parseChapter(html, seed) {
  const title = text(html.match(/<h1\b[^>]*class=["'][^"']*h11[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || seed.title);
  const body = html.match(/<div\b[^>]*id=["']articleContent["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
  const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((item) => text(item[1])).filter(Boolean);
  const content = paragraphs.length ? paragraphs.join('\n\n') : text(body);
  if (!content) throw new Error(`Empty chapter: ${seed.source_url}`);
  return { title, source_url: seed.source_url, content };
}

async function mirrorBook(seed, parsed) {
  const queue = parsed.chapters.map((item) => ({ ...item, trail: [] }));
  const seen = new Set([seed.source_url]);
  const chapters = [];
  const failures = [];
  let cursor = 0;
  while (cursor < queue.length) {
    const batch = queue.slice(cursor, cursor + CONCURRENCY);
    cursor += batch.length;
    const results = await pool(batch, async (item) => {
      if (seen.has(item.source_url)) return { skip: true };
      seen.add(item.source_url);
      const html = await fetchText(item.source_url);
      const article = html.match(/<div\b[^>]*id=["']articleContent["'][^>]*>/i);
      if (item.kind === 'chapter' || article) {
        const chapter = parseChapter(html, item);
        return { chapter: { ...chapter, section: item.trail.join(' / ') } };
      }
      const nested = parseBook(html, { title: item.title, source_url: item.source_url, slug: seed.slug, cover: '' });
      return { nested: nested.chapters.map((child) => ({ ...child, trail: [...item.trail, nested.title || item.title] })) };
    });
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (result?.error) failures.push({ source_url: batch[index].source_url, error: result.error });
      else if (result?.chapter) chapters.push(result.chapter);
      else if (result?.nested?.length) queue.push(...result.nested);
    }
    if (queue.length > 20_000) throw new Error(`Safety limit exceeded for ${seed.title}`);
  }
  return { chapters, failures, discoveredCount: seen.size - 1 };
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function mirrorCover(book) {
  if (!book.cover || !safeSource(book.cover)) return book;
  try {
    const response = await fetch(book.cover, { headers: { 'user-agent': USER_AGENT, accept: 'image/*' }, signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = (response.headers.get('content-type') || '').toLowerCase();
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'jpg';
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error(`Invalid cover size ${bytes.length}`);
    await fs.mkdir(COVERS_OUT, { recursive: true });
    await fs.writeFile(path.join(COVERS_OUT, `${book.slug}.${ext}`), bytes);
    return { ...book, source_cover: book.cover, cover: `/assets/library-covers/${book.slug}.${ext}` };
  } catch (error) {
    console.warn(`[library] cover failed ${book.title}: ${error.message}`);
    return book;
  }
}

const indexHtml = await fetchText(SOURCE);
let catalog = parseCatalog(indexHtml);
const filter = String(process.env.LIBRARY_SYNC_BOOK_FILTER || '').trim().toLowerCase();
if (filter) catalog = catalog.filter((book) => book.slug.includes(filter) || book.title.toLowerCase().includes(filter));
const maxBooks = Number(process.env.LIBRARY_SYNC_MAX_BOOKS || 0);
if (maxBooks > 0) catalog = catalog.slice(0, maxBooks);
if (!catalog.length) throw new Error('Source catalog returned zero books.');
console.log(`[library] catalog: ${catalog.length} books`);

if (CATALOG_ONLY) {
  await writeJson(path.join(OUT, 'manifest.json'), {
    source: SOURCE,
    synced_at: new Date().toISOString(),
    complete: false,
    books: catalog.map((book) => ({ ...book, chapter_count: null })),
  });
  console.log('[library] catalog-only manifest written');
  process.exit(0);
}

await fs.mkdir(BOOKS_OUT, { recursive: true });
const bookResults = await pool(catalog, async (seed, index) => {
  console.log(`[library] book ${index + 1}/${catalog.length}: ${seed.title}`);
  const parsed = await mirrorCover(parseBook(await fetchText(seed.source_url), seed));
  const mirrored = await mirrorBook(seed, parsed);
  const chapters = mirrored.chapters;
  const failed = mirrored.failures;
  const payload = { ...parsed, chapter_count: mirrored.discoveredCount, mirrored_chapter_count: chapters.length, failed_chapters: failed, chapters };
  await writeJson(path.join(BOOKS_OUT, `${seed.slug}.json`), payload);
  return { slug: seed.slug, title: parsed.title, description: parsed.description, cover: parsed.cover, source_url: seed.source_url, chapter_count: mirrored.discoveredCount, mirrored_chapter_count: chapters.length, complete: failed.length === 0 };
});

const validBooks = bookResults.filter((book) => book && !book.error);
const failedBooks = bookResults.filter((book) => book?.error);
await writeJson(path.join(OUT, 'manifest.json'), {
  source: SOURCE,
  synced_at: new Date().toISOString(),
  complete: failedBooks.length === 0 && validBooks.every((book) => book.complete),
  book_count: catalog.length,
  mirrored_book_count: validBooks.length,
  chapter_count: validBooks.reduce((sum, book) => sum + book.chapter_count, 0),
  mirrored_chapter_count: validBooks.reduce((sum, book) => sum + book.mirrored_chapter_count, 0),
  failed_books: failedBooks,
  books: validBooks,
});
console.log(`[library] complete: ${validBooks.length}/${catalog.length} books`);
if (failedBooks.length && process.argv.includes('--strict')) process.exitCode = 2;
