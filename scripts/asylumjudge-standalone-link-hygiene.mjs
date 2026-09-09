import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(process.cwd(), '.netlify', 'asylumjudge-bundle', 'public');
const LEGACY_INTERNAL = new Map([
  ['/asylumjudge/courts', '/courts/'],
  ['/asylumjudge/states', '/states/'],
  ['/asylumjudge/nationality', '/nationality/'],
  ['/asylumjudge/methodology', '/methodology/'],
  ['/asylumjudge', '/']
]);
const TRRB_EXTERNAL = [
  '/immigrate/center', '/immigrate/', '/hot-headlines', '/us-politics', '/us-crime', '/ice',
  '/huarengongzuo/', '/jobs/', '/legal/', '/privacy.html', '/terms.html'
];
const BRAND_REPLACEMENTS = new Map([
  ['TRRB · EOIR JUDGE PROFILE', 'ASYLUMJUDGE · IMMIGRATION JUDGE PROFILE'],
  ['TRRB · STATE ASYLUM DATA', 'ASYLUMJUDGE · STATE ASYLUM DATA'],
  ['TRRB · COURT ASYLUM DATA', 'ASYLUMJUDGE · COURT ASYLUM DATA'],
  ['TRRB · GLOBAL ASYLUM NATIONALITY DATA', 'ASYLUMJUDGE · GLOBAL ASYLUM NATIONALITY DATA']
]);
const DYNAMIC_ROUTES = new Set(['/judge', '/court', '/courts', '/states', '/nationality', '/compare', '/methodology', '/community']);
const LOCALE_DYNAMIC_RE = /^\/(?:en|es|fr|pt-br|hi|zh-hant|ru|ar|tr)\/(?:judge|court)$/;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rewriteHrefPrefix = (html, from, to) => html.replace(new RegExp(`href="${escapeRegex(from)}(?=["?#])`, 'g'), `href="${to}`);
async function walk(dir, predicate, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, predicate, out);
    else if (entry.isFile() && predicate(entry.name)) out.push(path);
  }
  return out;
}
async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}
function internalHrefs(html) {
  return [...html.matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]).filter((href) => href.startsWith('/') && !href.startsWith('//'));
}
async function resolvesInternalHref(href) {
  const rawPath = href.split(/[?#]/, 1)[0] || '/';
  if (DYNAMIC_ROUTES.has(rawPath) || LOCALE_DYNAMIC_RE.test(rawPath)) return true;
  const relative = rawPath.replace(/^\/+/, '');
  const direct = join(OUT, relative);
  if (await exists(direct) || await exists(join(direct, 'index.html'))) return true;
  if (!rawPath.endsWith('/') && await exists(`${direct}.html`)) return true;
  return false;
}

const htmlFiles = await walk(OUT, (name) => name.endsWith('.html'));
let changedFiles = 0;
let replacements = 0;
for (const path of htmlFiles) {
  const before = await readFile(path, 'utf8');
  let html = before;
  for (const [from, to] of LEGACY_INTERNAL) {
    const pattern = new RegExp(`href="${escapeRegex(from)}(?=["?#])`, 'g');
    replacements += (html.match(pattern) || []).length;
    html = rewriteHrefPrefix(html, from, to);
  }
  for (const from of TRRB_EXTERNAL) {
    const pattern = new RegExp(`href="${escapeRegex(from)}(?=["?#])`, 'g');
    replacements += (html.match(pattern) || []).length;
    html = rewriteHrefPrefix(html, from, `https://trrb.net${from}`);
  }
  for (const [from, to] of BRAND_REPLACEMENTS) {
    const pattern = new RegExp(escapeRegex(from), 'g');
    replacements += (html.match(pattern) || []).length;
    html = html.replace(pattern, to);
  }
  if (html !== before) {
    await writeFile(path, html);
    changedFiles += 1;
  }
}

const broken = new Map();
for (const path of htmlFiles) {
  const html = await readFile(path, 'utf8');
  for (const href of internalHrefs(html)) {
    if (await resolvesInternalHref(href)) continue;
    const key = href.split(/[?#]/, 1)[0] || href;
    broken.set(key, (broken.get(key) || 0) + 1);
  }
}
if (broken.size) {
  const details = [...broken.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([href, count]) => `${count} × ${href}`).join('\n');
  throw new Error(`AsylumJudge standalone link hygiene found ${broken.size} unresolved internal routes:\n${details}`);
}

let legacyBrandHits = 0;
for (const path of htmlFiles) {
  const html = await readFile(path, 'utf8');
  for (const token of BRAND_REPLACEMENTS.keys()) legacyBrandHits += (html.match(new RegExp(escapeRegex(token), 'g')) || []).length;
}
if (legacyBrandHits) throw new Error(`AsylumJudge standalone link hygiene left ${legacyBrandHits} legacy TRRB brand labels in the production bundle.`);

console.log(`AsylumJudge standalone link hygiene: ${changedFiles} HTML files changed; ${replacements} broken/legacy hrefs or brand labels rewritten; 0 unresolved internal routes; 0 legacy profile labels.`);
