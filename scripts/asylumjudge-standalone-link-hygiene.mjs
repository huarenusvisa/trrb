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
  ['TRRB · GLOBAL ASYLUM NATIONALITY DATA', 'ASYLUMJUDGE · GLOBAL ASYLUM NATIONALITY DATA'],
  ['TRRB · EOIR COURT PROFILE', 'ASYLUMJUDGE · IMMIGRATION COURT PROFILE'],
  ['TRRB · EOIR COURT DATABASE', 'ASYLUMJUDGE · IMMIGRATION COURT DATABASE'],
  ['TRRB · DATA METHODOLOGY', 'ASYLUMJUDGE · DATA METHODOLOGY'],
  ['TRRB · EOIR IMMIGRATION DATA', 'ASYLUMJUDGE · EOIR IMMIGRATION DATA'],
  ['<b>唐人日报 Tang Ren Daily</b>', '<b>AsylumJudge.com</b>'],
  ['Tang Ren Daily organizes public data only and provides no legal conclusion for any individual case.', 'AsylumJudge organizes public data only and provides no legal conclusion for any individual case.'],
  ['唐人日报仅整理公开数据，不提供针对具体案件的法律结论。', '庇护法官仅整理公开数据，不提供针对具体案件的法律结论。']
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

function applyStandaloneChineseBrand(html) {
  if (!/<html[^>]+lang=["']zh-Hans["']/i.test(html)) return html;
  let next = html
    .replace(/｜唐人日报/g, '｜庇护法官')
    .replace(/\|\s*唐人日报/g, '| 庇护法官')
    .replace(/｜AsylumJudge(?:\.com)?/g, '｜庇护法官')
    .replace(/\|\s*AsylumJudge(?:\.com)?/g, '| 庇护法官')
    .replace(/<b>AsylumJudge\.com<\/b>/g, '<b>庇护法官</b>')
    .replace(/aria-label="AsylumJudge\.com"/g, 'aria-label="庇护法官 AsylumJudge"')
    .replace(/alt="AsylumJudge\.com"/g, 'alt="庇护法官 AsylumJudge"');

  // Standalone Chinese pages must never present Tang Ren Daily as the site brand.
  // TRRB may still be named inside clearly external/content-source modules and links.
  next = next
    .replace(/(<header\b[^>]*>[\s\S]*?<\/header>)/gi, (header) => header
      .replace(/唐人日报\s*Tang Ren Daily/gi, '庇护法官')
      .replace(/Tang Ren Daily\s*·\s*AsylumJudge/gi, '庇护法官')
      .replace(/唐人日报/g, '庇护法官'))
    .replace(/(<footer\b[^>]*>[\s\S]*?<\/footer>)/gi, (footer) => footer
      .replace(/唐人日报\s*Tang Ren Daily/gi, '庇护法官')
      .replace(/Tang Ren Daily\s*·\s*AsylumJudge/gi, '庇护法官')
      .replace(/AsylumJudge\.com/gi, '庇护法官')
      .replace(/唐人日报/g, '庇护法官'));
  return next;
}

async function hardenRuntimeBranding() {
  const path = join(OUT, 'asylumjudge', 'domain-brand.js');
  if (!(await exists(path))) return 0;
  const before = await readFile(path, 'utf8');
  let js = before;
  js = js.replace(
    "'zh-Hans': { descriptor: '美国移民法官与法院数据', nav: '移民法官数据导航', skip: '跳到主要内容', footer: '共用 EOIR 数据库 · 持续更新' }",
    "'zh-Hans': { descriptor: '庇护法官', nav: '庇护法官数据导航', skip: '跳到主要内容', footer: 'EOIR公开数据 · 持续更新' }"
  );
  js = js.replace(
    "if (descriptor) descriptor.innerHTML = `<b>${brandSet.descriptor}</b><span>EOIR Immigration Court Data</span>`;",
    "if (descriptor) descriptor.innerHTML = `<b>${brandSet.descriptor}</b><span>${locale === 'zh-Hans' ? '美国移民法官与法院数据' : 'EOIR Immigration Court Data'}</span>`;"
  );
  js = js.replace(
    "if (footer) footer.innerHTML = `<b>${standaloneHost ? 'AsylumJudge.com' : 'Tang Ren Daily · AsylumJudge'}</b><span>${brandSet.footer}</span>`;",
    "if (footer) footer.innerHTML = `<b>${standaloneHost ? (locale === 'zh-Hans' ? '庇护法官' : 'AsylumJudge.com') : 'Tang Ren Daily · AsylumJudge'}</b><span>${brandSet.footer}</span>`;"
  );
  js = js.replace(
    "const next = standaloneHost ? document.title.replace(/｜唐人日报/g, '｜移民法官通过率') : document.title;",
    "const next = standaloneHost ? document.title.replace(/｜唐人日报/g, locale === 'zh-Hans' ? '｜庇护法官' : '｜AsylumJudge') : document.title;"
  );
  if (js !== before) {
    await writeFile(path, js);
    return 1;
  }
  return 0;
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
  html = applyStandaloneChineseBrand(html);
  if (html !== before) {
    await writeFile(path, html);
    changedFiles += 1;
  }
}

const runtimeBrandFiles = await hardenRuntimeBranding();

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
if (legacyBrandHits) throw new Error(`AsylumJudge standalone link hygiene left ${legacyBrandHits} legacy TRRB/Tang Ren Daily primary-brand labels in the production bundle.`);

console.log(`AsylumJudge standalone link hygiene: ${changedFiles} HTML files changed; ${replacements} broken/legacy hrefs or primary-brand labels rewritten; ${runtimeBrandFiles} runtime brand file hardened; 0 unresolved internal routes; 0 legacy primary-brand labels.`);
