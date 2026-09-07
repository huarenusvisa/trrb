import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { runInNewContext } from 'node:vm';

const LOCALE_PREFIX_TO_CODE = new Map([
  ['en', 'en'],
  ['es', 'es'],
  ['fr', 'fr'],
  ['pt-br', 'pt-BR'],
  ['hi', 'hi'],
  ['zh-hant', 'zh-Hant'],
  ['ru', 'ru'],
  ['ar', 'ar'],
  ['tr', 'tr']
]);

const TRANSLATION_COLUMN = new Map([
  ['en', 1],
  ['es', 2],
  ['fr', 3],
  ['pt-BR', 4],
  ['hi', 5],
  ['zh-Hant', 6],
  ['ru', 7],
  ['ar', 8],
  ['tr', 9]
]);

const NON_DEFAULT_PREFIXES = [...LOCALE_PREFIX_TO_CODE.keys()];
const SOURCE_DIRS = new Set(['asylumjudge', 'immigration-judge-approval-rate', 'community', 'assets']);

function extractArrayLiteral(source, marker) {
  const markerAt = source.indexOf(marker);
  if (markerAt < 0) throw new Error(`Unable to find ${marker}`);
  const start = source.indexOf('[', markerAt + marker.length);
  if (start < 0) throw new Error(`Unable to find array after ${marker}`);

  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '[') depth += 1;
    if (char === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated array after ${marker}`);
}

function loadTranslationRows(source) {
  const literal = extractArrayLiteral(source, 'const rows =');
  const rows = runInNewContext(`(${literal})`, Object.create(null), { timeout: 1500 });
  if (!Array.isArray(rows) || rows.length < 20) throw new Error('AsylumJudge translation rows are unavailable or unexpectedly small');
  return rows;
}

function translationPairs(rows, localeCode) {
  const column = TRANSLATION_COLUMN.get(localeCode);
  if (!column) return [];
  return rows
    .filter((row) => Array.isArray(row) && typeof row[0] === 'string' && typeof row[column] === 'string')
    .map((row) => [row[0], row[column]])
    .filter(([source, target]) => source && target && source !== target)
    .sort((a, b) => b[0].length - a[0].length);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createTranslator(pairs) {
  const replacements = new Map(pairs);
  const pattern = pairs.length ? new RegExp(pairs.map(([source]) => escapeRegex(source)).join('|'), 'g') : null;
  return (html) => {
    if (!pattern) return { html, replacements: 0 };
    const protectedBlocks = [];
    let next = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, (block) => {
      const token = `__AJ_PROTECTED_${protectedBlocks.length}__`;
      protectedBlocks.push(block);
      return token;
    });
    let count = 0;
    next = next.replace(pattern, (matched) => {
      count += 1;
      return replacements.get(matched) || matched;
    });
    next = next.replace(/__AJ_PROTECTED_(\d+)__/g, (_, index) => protectedBlocks[Number(index)] || '');
    return { html: next, replacements: count };
  };
}

async function collectIndexPages(dir, root = dir, pages = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === root && SOURCE_DIRS.has(entry.name)) continue;
      await collectIndexPages(absolute, root, pages);
      continue;
    }
    if (entry.isFile() && entry.name === 'index.html') pages.push(absolute);
  }
  return pages;
}

function localeForGeneratedPage(output, filename) {
  const rel = relative(output, filename).split(sep).join('/');
  const first = rel.split('/')[0].toLowerCase();
  return { rel, locale: LOCALE_PREFIX_TO_CODE.get(first) || 'zh-Hans' };
}

function visibleCjkCount(html) {
  const visible = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ');
  return (visible.match(/[\u3400-\u9fff]/g) || []).length;
}

async function suppressUntranslatedMethodology(output) {
  for (const prefix of NON_DEFAULT_PREFIXES) {
    await rm(join(output, prefix, 'methodology'), { recursive: true, force: true });
  }

  const sitemapPath = join(output, 'sitemap-static.xml');
  let sitemap = await readFile(sitemapPath, 'utf8');
  const before = (sitemap.match(/<url>/g) || []).length;
  const prefixPattern = NON_DEFAULT_PREFIXES.map((value) => value.replace('-', '\\-')).join('|');
  const regex = new RegExp(`\\s*<url><loc>https:\\/\\/asylumjudge\\.com\\/(?:${prefixPattern})\\/methodology\\/<\\/loc><lastmod>[^<]+<\\/lastmod><\\/url>`, 'g');
  sitemap = sitemap.replace(regex, '');
  await writeFile(sitemapPath, sitemap);
  const after = (sitemap.match(/<url>/g) || []).length;

  const methodologyPath = join(output, 'methodology', 'index.html');
  let methodology = await readFile(methodologyPath, 'utf8');
  methodology = methodology.replace(/\s*<link rel="alternate" hreflang="[^"]+" href="[^"]+">/g, '');
  const canonical = '<link rel="canonical" href="https://asylumjudge.com/methodology/">';
  const alternates = `${canonical}\n  <link rel="alternate" hreflang="zh-Hans" href="https://asylumjudge.com/methodology/">\n  <link rel="alternate" hreflang="x-default" href="https://asylumjudge.com/methodology/">`;
  methodology = methodology.replace(canonical, alternates);
  await writeFile(methodologyPath, methodology);

  return before - after;
}

async function assertSitemapHygiene(output) {
  const sitemapFiles = ['sitemap-static.xml', 'sitemap-judges.xml', 'sitemap-courts.xml', 'sitemap-nationalities.xml'];
  const bad = [];
  for (const name of sitemapFiles) {
    const xml = await readFile(join(output, name), 'utf8');
    const urls = [...xml.matchAll(/<loc>(https:\/\/asylumjudge\.com[^<]+)<\/loc>/g)].map((match) => match[1]);
    for (const url of urls) {
      const parsed = new URL(url);
      if (parsed.search) bad.push(`${name}: query URL ${url}`);
      if (/\.html(?:$|\/)/i.test(parsed.pathname)) bad.push(`${name}: source HTML URL ${url}`);
      if (/^\/(?:judge|court)\/?$/i.test(parsed.pathname)) bad.push(`${name}: legacy shell ${url}`);
      if (NON_DEFAULT_PREFIXES.some((prefix) => parsed.pathname === `/${prefix}/methodology/`)) bad.push(`${name}: untranslated methodology ${url}`);
    }
  }
  if (bad.length) throw new Error(`AsylumJudge sitemap indexing hygiene failed:\n${bad.join('\n')}`);
}

export async function applyAsylumJudgeIndexingHygiene({ root, output }) {
  const i18n = await readFile(join(root, 'asylumjudge', 'app-i18n.js'), 'utf8');
  const rows = loadTranslationRows(i18n);
  const pages = await collectIndexPages(output);
  const translators = new Map([...TRANSLATION_COLUMN.keys()].map((locale) => [locale, createTranslator(translationPairs(rows, locale))]));

  let localizedPages = 0;
  let replacementCount = 0;
  const cjkWarnings = [];
  for (const filename of pages) {
    const { rel, locale } = localeForGeneratedPage(output, filename);
    if (locale === 'zh-Hans' || rel.endsWith('/methodology/index.html')) continue;
    const translate = translators.get(locale);
    if (!translate) continue;
    let html = await readFile(filename, 'utf8');
    const result = translate(html);
    if (result.replacements) {
      html = result.html;
      await writeFile(filename, html);
      localizedPages += 1;
      replacementCount += result.replacements;
    }
    const cjk = visibleCjkCount(html);
    if (locale !== 'zh-Hant' && cjk > 120) cjkWarnings.push({ page: rel, locale, cjk });
  }

  const removedMethodologyUrls = await suppressUntranslatedMethodology(output);
  await assertSitemapHygiene(output);

  const report = {
    generated_at: new Date().toISOString(),
    localized_pages: localizedPages,
    server_side_replacements: replacementCount,
    removed_untranslated_methodology_urls: removedMethodologyUrls,
    high_cjk_pages: cjkWarnings.slice(0, 50)
  };
  await writeFile(join(output, 'asylumjudge-indexing-hygiene.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`AsylumJudge indexing hygiene: ${localizedPages} pages localized server-side, ${removedMethodologyUrls} untranslated methodology URLs removed from sitemap`);
  if (cjkWarnings.length) console.warn(`AsylumJudge indexing hygiene: ${cjkWarnings.length} non-Chinese pages still contain substantial CJK text; see asylumjudge-indexing-hygiene.json`);
  return report;
}
