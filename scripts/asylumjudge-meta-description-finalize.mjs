import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(process.cwd(), '.netlify', 'asylumjudge-bundle', 'public');

const suffixes = {
  en: ' Compare asylum approval and denial rates, case sample size, court assignment, data period, historical trends, and public EOIR judge background information on AsylumJudge.',
  es: ' Compare tasas de aprobación y denegación de asilo, tamaño de muestra, tribunal, período, tendencias históricas y antecedentes públicos de jueces de EOIR en AsylumJudge.',
  fr: ' Comparez les taux d’approbation et de refus d’asile, la taille de l’échantillon, le tribunal, la période, les tendances historiques et les données publiques EOIR sur AsylumJudge.',
  'pt-br': ' Compare taxas de aprovação e negativa de asilo, amostra, tribunal, período, tendências históricas e dados públicos de juízes do EOIR no AsylumJudge.',
  hi: ' EOIR के सार्वजनिक डेटा के आधार पर शरण स्वीकृति और अस्वीकृति दर, नमूना आकार, अदालत, अवधि, ऐतिहासिक रुझान और जज पृष्ठभूमि देखें।',
  'zh-hans': ' 可同时查看庇护批准率、拒绝率、案件样本量、任职法院、统计期间、年度趋势及EOIR公开法官背景资料；历史统计不能预测个案结果。',
  'zh-hant': ' 可同時查看庇護批准率、拒絕率、案件樣本量、任職法院、統計期間、年度趨勢及EOIR公開法官背景資料；歷史統計不能預測個案結果。',
  ru: ' Сравнивайте одобрения и отказы по убежищу, размер выборки, суд, период, исторические тенденции и открытые данные EOIR о судьях на AsylumJudge.',
  ar: ' قارن معدلات قبول ورفض اللجوء وحجم العينة والمحكمة والفترة والاتجاهات التاريخية وبيانات قضاة الهجرة العامة من EOIR على AsylumJudge.',
  tr: ' AsylumJudge üzerinde iltica onay ve ret oranlarını, örneklem büyüklüğünü, mahkemeyi, dönemi, geçmiş eğilimleri ve EOIR kamu hâkim bilgilerini karşılaştırın.'
};

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

function localeOf(html) {
  const raw = (html.match(/<html[^>]*\blang=["']([^"']+)["']/i)?.[1] || 'zh-Hans').toLowerCase();
  if (raw.startsWith('pt')) return 'pt-br';
  if (raw.startsWith('zh-hant') || raw.startsWith('zh-tw') || raw.startsWith('zh-hk')) return 'zh-hant';
  if (raw.startsWith('zh')) return 'zh-hans';
  return raw.split('-')[0];
}

function decode(value) {
  return String(value || '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function findDescriptionTag(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/\bname\s*=\s*["']description["']/i.test(tag)) continue;
    const content = tag.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i);
    if (content) return { tag, value: content[2], quote: content[1] };
  }
  return null;
}

function finalize(html) {
  const found = findDescriptionTag(html);
  if (!found) return { html, changed: false };
  const locale = localeOf(html);
  const min = locale === 'zh-hans' || locale === 'zh-hant' ? 72 : 120;
  const max = locale === 'zh-hans' || locale === 'zh-hant' ? 110 : 180;
  let text = decode(found.value);
  if (text.length >= min) return { html, changed: false };
  const suffix = suffixes[locale] || suffixes.en;
  while (text.length < min) {
    const joiner = text && !/[。.!?！？]$/.test(text) ? (locale.startsWith('zh') ? '。' : '. ') : ' ';
    text = `${text}${joiner}${suffix}`.replace(/\s+/g, ' ').trim();
  }
  if (text.length > max) {
    const cut = text.slice(0, max);
    const stop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('。'), cut.lastIndexOf('؛'), cut.lastIndexOf('।'));
    text = (stop >= min ? cut.slice(0, stop + 1) : cut).trim();
  }
  if (text.length < min) text = `${text} ${suffix}`.slice(0, max).trim();
  const nextTag = found.tag.replace(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i, `content="${escapeAttr(text)}"`);
  return { html: html.replace(found.tag, nextTag), changed: true };
}

const files = await walk(OUT);
let changed = 0;
let missing = 0;
let short = 0;
for (const path of files) {
  const before = await readFile(path, 'utf8');
  const result = finalize(before);
  if (result.changed) {
    await writeFile(path, result.html);
    changed += 1;
  }
  const check = findDescriptionTag(result.html);
  if (!check) continue;
  const locale = localeOf(result.html);
  const min = locale === 'zh-hans' || locale === 'zh-hant' ? 72 : 120;
  if (decode(check.value).length < min) short += 1;
}
if (short) throw new Error(`Meta description finalizer still found ${short} short descriptions.`);
console.log(`AsylumJudge meta-description finalizer: ${changed} pages extended; 0 short descriptions remain.`);
