import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const OUT = join(process.cwd(), '.netlify', 'asylumjudge-bundle', 'public');
const PRIMARY_DETAIL_LOCALES = new Set(['', 'en', 'es', 'fr']);
const HUB_ONLY_LOCALES = new Set(['pt-br', 'hi', 'zh-hant', 'ru', 'ar', 'tr']);
const ENTITY_SEGMENTS = new Set(['judges', 'courts', 'nationalities']);
const MIN_DESCRIPTION = 110;
const MAX_DESCRIPTION = 180;

const DESCRIPTION_SUFFIX = {
  '': ' 可同时查看批准率、拒绝率、案件样本量、所在法院、统计期间和历史趋势；数据依据EOIR公开资料整理，历史统计不能预测个案结果。',
  en: ' Compare approval and denial rates, sample size, court assignment, data period, and historical trends from public EOIR data; historical statistics cannot predict an individual case.',
  es: ' Compare tasas de aprobación y denegación, tamaño de muestra, tribunal, período y tendencias con datos públicos de EOIR; las estadísticas históricas no predicen casos individuales.',
  fr: ' Comparez taux d’approbation et de refus, taille de l’échantillon, tribunal, période et tendances à partir des données publiques EOIR; ces statistiques ne prédisent pas un dossier.',
  'pt-br': ' Compare aprovações, negativas, tamanho da amostra, tribunal, período e tendências com dados públicos do EOIR; estatísticas históricas não preveem casos individuais.',
  hi: ' EOIR के सार्वजनिक डेटा के आधार पर अनुमोदन, अस्वीकृति, नमूना आकार, अदालत, अवधि और रुझान की तुलना करें; ऐतिहासिक आँकड़े किसी व्यक्तिगत मामले की भविष्यवाणी नहीं करते।',
  'zh-hant': ' 可同時查看批准率、拒絕率、案件樣本量、所在法院、統計期間與歷史趨勢；資料依EOIR公開資料整理，歷史統計不能預測個案結果。',
  ru: ' Сравнивайте одобрения, отказы, размер выборки, суд, период и тенденции по открытым данным EOIR; историческая статистика не предсказывает исход отдельного дела.',
  ar: ' قارن معدلات الموافقة والرفض وحجم العينة والمحكمة والفترة والاتجاهات اعتمادًا على بيانات EOIR العامة؛ الإحصاءات التاريخية لا تتنبأ بنتيجة قضية فردية.',
  tr: ' EOIR kamu verileriyle onay ve ret oranlarını, örneklem büyüklüğünü, mahkemeyi, dönemi ve eğilimleri karşılaştırın; geçmiş istatistikler bireysel davayı öngörmez.'
};

function localeAndEntity(file) {
  const rel = relative(OUT, file).split(sep).join('/');
  const parts = rel.split('/');
  const first = parts[0];
  const knownLocale = first && (PRIMARY_DETAIL_LOCALES.has(first) || HUB_ONLY_LOCALES.has(first)) && first !== '';
  const locale = knownLocale ? first : '';
  const offset = knownLocale ? 1 : 0;
  const segment = parts[offset] || '';
  const detail = ENTITY_SEGMENTS.has(segment) && parts.length > offset + 2;
  return { rel, locale, segment, detail };
}

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) await walk(p, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function findDescriptionTag(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/\bname\s*=\s*["']description["']/i.test(tag)) continue;
    const content = tag.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i);
    if (content) return { tag, value: content[2] };
  }
  return null;
}

function decodeAttribute(value) {
  return String(value || '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function upsertRobots(html, content) {
  if (/<meta\s+name=["']robots["'][^>]*>/i.test(html)) {
    return html.replace(/<meta\s+name=["']robots["'][^>]*>/i, `<meta name="robots" content="${content}">`);
  }
  return html.replace('</head>', `  <meta name="robots" content="${content}">\n</head>`);
}

function improveDescription(html, locale) {
  const found = findDescriptionTag(html);
  if (!found) return html;
  let description = decodeAttribute(found.value);
  const suffix = DESCRIPTION_SUFFIX[locale] || DESCRIPTION_SUFFIX.en;
  while (description.length < MIN_DESCRIPTION) description += suffix;
  if (description.length > MAX_DESCRIPTION) {
    const cut = description.slice(0, MAX_DESCRIPTION - 1);
    const stop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('。'), cut.lastIndexOf('؛'), cut.lastIndexOf('।'));
    const word = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('，'), cut.lastIndexOf(','), cut.lastIndexOf('；'));
    const end = stop >= MIN_DESCRIPTION ? stop + 1 : word >= MIN_DESCRIPTION ? word : MAX_DESCRIPTION - 1;
    description = cut.slice(0, end).trim().replace(/[\s,;:，；：]+$/u, '');
    if (!/[。.!?！？؛।]$/u.test(description)) description += locale === '' || locale === 'zh-hant' ? '。' : '.';
  }
  const nextTag = found.tag.replace(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i, `content="${escapeAttribute(description)}"`);
  return html.replace(found.tag, nextTag);
}

function removeLowPriorityHreflang(html) {
  return html.replace(/\s*<link\s+rel=["']alternate["']\s+hreflang=["'](?:pt-BR|hi|zh-Hant|ru|ar|tr)["'][^>]*>\s*/gi, '\n');
}

function hierarchyBlock(locale) {
  const root = locale ? `/${locale}` : '';
  const core = locale === 'en' ? '/en/asylum-judge-rating/' : locale ? `${root}/` : '/asylum-judge-approval-rate/';
  const labels = locale === 'en'
    ? ['Asylum judge rating guide', 'Browse immigration courts', 'Browse states', 'Nationality outcomes', 'Official judge backgrounds']
    : locale === ''
      ? ['庇护法官通过率', '浏览移民法院', '按州查看', '按国籍查看', '法官官方背景']
      : ['Approval-rate guide', 'Immigration courts', 'State data', 'Nationality outcomes', 'Judge backgrounds'];
  return `<nav class="search-hierarchy" aria-label="${locale === '' ? '庇护法官数据导航' : 'AsylumJudge data navigation'}" data-search-hierarchy="true"><a href="${core}">${labels[0]}</a> · <a href="${root}/courts/">${labels[1]}</a> · <a href="${root}/states/">${labels[2]}</a> · <a href="${root}/nationality/">${labels[3]}</a> · <a href="${root}/judge-backgrounds/">${labels[4]}</a></nav>`;
}

function addHierarchy(html, locale) {
  if (html.includes('data-search-hierarchy="true"')) return html;
  const block = hierarchyBlock(locale);
  if (html.includes('</main>')) return html.replace('</main>', `${block}\n</main>`);
  return html.replace('</body>', `${block}\n</body>`);
}

function addDatasetCitation(html) {
  if (html.includes('data-asylumjudge-citation="true"')) return html;
  const section = `<section class="note" data-asylumjudge-citation="true" id="cite-asylumjudge"><h2>引用庇护法官 / Cite AsylumJudge</h2><p>建议引用：AsylumJudge（庇护法官），美国移民法官与移民法院庇护裁决统计数据库，https://asylumjudge.com/ 。引用具体数字时请同时注明页面链接、统计期间、案件样本量和数据口径。</p></section>`;
  const schema = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'AsylumJudge U.S. Immigration Judge and Asylum Decision Statistics',
    alternateName: '庇护法官美国移民法官与庇护裁决统计数据库',
    url: 'https://asylumjudge.com/',
    description: 'Public immigration judge, immigration court, asylum approval, denial, sample-size, state and nationality statistics organized from EOIR data.',
    creator: { '@type': 'Organization', name: 'AsylumJudge', url: 'https://asylumjudge.com/' },
    license: 'https://asylumjudge.com/methodology/#data-license',
    isBasedOn: 'https://www.justice.gov/eoir'
  }).replace(/</g, '\\u003c')}</script>`;
  let next = html.replace('</head>', `${schema}\n</head>`);
  if (next.includes('</main>')) next = next.replace('</main>', `${section}\n</main>`);
  else next = next.replace('</body>', `${section}\n</body>`);
  return next;
}

function stripUrlsFromSitemap(xml) {
  return xml.replace(/\s*<url>\s*<loc>https:\/\/asylumjudge\.com\/(pt-br|hi|zh-hant|ru|ar|tr)\/(judges|courts|nationalities)\/[^<]+<\/loc>[\s\S]*?<\/url>/gi, '');
}

const files = await walk(OUT);
let noindexed = 0;
let descriptions = 0;
let hierarchy = 0;
for (const file of files) {
  const { locale, detail } = localeAndEntity(file);
  const before = await readFile(file, 'utf8');
  let html = before;
  const descBefore = findDescriptionTag(html)?.value || '';
  html = improveDescription(html, locale);
  const descAfter = findDescriptionTag(html)?.value || '';
  if (descAfter !== descBefore) descriptions += 1;

  if (detail && HUB_ONLY_LOCALES.has(locale)) {
    html = upsertRobots(html, 'noindex,follow,max-image-preview:large');
    noindexed += 1;
  } else if (detail && PRIMARY_DETAIL_LOCALES.has(locale)) {
    html = removeLowPriorityHreflang(html);
    const withHierarchy = addHierarchy(html, locale);
    if (withHierarchy !== html) hierarchy += 1;
    html = withHierarchy;
  }

  const rel = relative(OUT, file).split(sep).join('/');
  if (rel === 'methodology/index.html') html = addDatasetCitation(html);

  if (html !== before) await writeFile(file, html);
}

for (const sitemapName of ['sitemap-judges.xml', 'sitemap-courts.xml', 'sitemap-nationalities.xml']) {
  const p = join(OUT, sitemapName);
  const before = await readFile(p, 'utf8');
  const after = stripUrlsFromSitemap(before);
  if (after !== before) await writeFile(p, after);
}

console.log(`AsylumJudge search quality: ${noindexed} low-demand translated detail pages changed to noindex/follow; ${descriptions} meta descriptions lengthened; ${hierarchy} primary detail pages received hierarchy links; low-priority detail URLs removed from XML sitemaps; citeable Dataset metadata added.`);
