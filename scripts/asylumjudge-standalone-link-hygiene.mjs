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
  ['<b>唐人日报 Tang Ren Daily</b>', '<b>庇护法官</b>'],
  ['<b>Tang Ren Daily · AsylumJudge</b>', '<b>AsylumJudge.com</b>'],
  ['Tang Ren Daily organizes public data only and provides no legal conclusion for any individual case.', 'AsylumJudge organizes public EOIR immigration-court data and provides no legal conclusion for any individual case.'],
  ['唐人日报仅整理公开数据，不提供针对具体案件的法律结论。', '庇护法官整理美国移民法院公开数据，不提供针对具体案件的法律结论。']
]);
const DYNAMIC_ROUTES = new Set(['/judge', '/court', '/courts', '/states', '/nationality', '/compare', '/methodology', '/community']);
const LOCALE_DYNAMIC_RE = /^\/(?:en|es|fr|pt-br|hi|zh-hant|ru|ar|tr)\/(?:judge|court)$/;
const META_SUFFIX = {
  en: 'Compare EOIR asylum approval rates, denial rates, case counts, court assignments, historical trends, and official immigration-judge background data on AsylumJudge.',
  es: 'Compare tasas de aprobación y denegación de asilo, volumen de casos, tribunales, tendencias históricas y datos oficiales de jueces de inmigración en AsylumJudge.',
  fr: 'Comparez les taux d’approbation et de refus d’asile, les volumes de dossiers, les tribunaux, les tendances historiques et les données officielles des juges sur AsylumJudge.',
  'pt-br': 'Compare taxas de aprovação e negativa de asilo, volumes de casos, tribunais, tendências históricas e dados oficiais de juízes de imigração no AsylumJudge.',
  hi: 'AsylumJudge पर EOIR शरण स्वीकृति दर, अस्वीकृति दर, मामले की संख्या, अदालत, ऐतिहासिक रुझान और आधिकारिक इमिग्रेशन जज पृष्ठभूमि डेटा देखें।',
  'zh-hans': '可查询美国移民法官庇护批准率、拒绝率、案件样本量、任职法院、年度趋势和EOIR公开背景数据，并结合统计口径理解历史裁决结果。',
  'zh-hant': '可查詢美國移民法官庇護批准率、拒絕率、案件樣本量、任職法院、年度趨勢和EOIR公開背景資料，並結合統計口徑理解歷史裁決結果。',
  ru: 'Сравнивайте доли одобрений и отказов по убежищу, объём дел, суды, исторические тенденции и официальные данные иммиграционных судей EOIR на AsylumJudge.',
  ar: 'قارن نسب قبول ورفض اللجوء وعدد القضايا والمحاكم والاتجاهات التاريخية وبيانات قضاة الهجرة الرسمية من EOIR على AsylumJudge.',
  tr: 'AsylumJudge üzerinde EOIR iltica onay ve ret oranlarını, dosya sayılarını, mahkemeleri, geçmiş eğilimleri ve resmi göçmenlik hâkimi geçmiş bilgilerini karşılaştırın.'
};

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
function localeForHtml(html) {
  const raw = (html.match(/<html[^>]*\blang=["']([^"']+)["']/i)?.[1] || 'zh-Hans').toLowerCase();
  if (raw.startsWith('pt')) return 'pt-br';
  if (raw.startsWith('zh-hant') || raw.startsWith('zh-tw') || raw.startsWith('zh-hk')) return 'zh-hant';
  if (raw.startsWith('zh')) return 'zh-hans';
  return raw.split('-')[0];
}
function plainText(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function improveMetaDescription(html) {
  const match = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']\s*\/?\s*>/i)
    || html.match(/<meta\s+content=["']([^"']*)["']\s+name=["']description["']\s*\/?\s*>/i);
  if (!match) return { html, changed: false };
  const current = plainText(match[1]);
  const locale = localeForHtml(html);
  const min = locale === 'zh-hans' || locale === 'zh-hant' ? 72 : 120;
  if (current.length >= min) return { html, changed: false };
  const suffix = META_SUFFIX[locale] || META_SUFFIX.en;
  let next = `${current}${/[。.!?！？]$/.test(current) ? '' : locale.startsWith('zh') ? '。' : '. '}${suffix}`.replace(/\s+/g, ' ').trim();
  const max = locale === 'zh-hans' || locale === 'zh-hant' ? 105 : 175;
  if (next.length > max) next = next.slice(0, max).replace(/[\s,;:，；：]+$/u, '') + (locale.startsWith('zh') ? '。' : '.');
  return { html: html.replace(match[0], match[0].replace(match[1], escapeAttr(next))), changed: true };
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
let metaDescriptionsImproved = 0;
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
  const metaResult = improveMetaDescription(html);
  html = metaResult.html;
  if (metaResult.changed) metaDescriptionsImproved += 1;
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
let shortMetaDescriptions = 0;
for (const path of htmlFiles) {
  const html = await readFile(path, 'utf8');
  for (const token of BRAND_REPLACEMENTS.keys()) legacyBrandHits += (html.match(new RegExp(escapeRegex(token), 'g')) || []).length;
  const meta = plainText(html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] || '');
  const locale = localeForHtml(html);
  const min = locale === 'zh-hans' || locale === 'zh-hant' ? 72 : 120;
  if (meta && meta.length < min) shortMetaDescriptions += 1;
}
if (legacyBrandHits) throw new Error(`AsylumJudge standalone link hygiene left ${legacyBrandHits} legacy TRRB/Tang Ren Daily primary-brand labels in the production bundle.`);
if (shortMetaDescriptions) throw new Error(`AsylumJudge standalone link hygiene left ${shortMetaDescriptions} pages with short meta descriptions.`);

console.log(`AsylumJudge standalone link hygiene: ${changedFiles} HTML files changed; ${replacements} broken/legacy hrefs or primary-brand labels rewritten; ${metaDescriptionsImproved} meta descriptions enriched; ${runtimeBrandFiles} runtime brand file hardened; 0 unresolved internal routes; 0 legacy primary-brand labels; 0 short meta descriptions.`);
