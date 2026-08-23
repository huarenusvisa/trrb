import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const i18n = readFileSync('asylumjudge/app-i18n.js', 'utf8');
const rowsMatch = i18n.match(/const rows = (\[[\s\S]*?\n  \]);\n\n  const indexes/);
assert.ok(rowsMatch, 'global translation rows must be readable');
const rows = Function(`"use strict"; return ${rowsMatch[1]}`)();

assert.deepEqual(
  Function(`"use strict"; ${i18n.match(/const locales = (\[[^;]+\]);/)[0]} return locales;`)(),
  ['en', 'es', 'fr', 'pt-BR', 'hi', 'zh-Hans', 'zh-Hant', 'ru', 'ar', 'tr']
);
assert.ok(rows.length >= 140, 'the full-site dictionary must cover the main static interface');
for (const row of rows) {
  assert.equal(row.length, 10, `every translation row needs source plus nine alternatives: ${row[0]}`);
  row.forEach((value) => assert.ok(String(value).trim(), `translation may not be blank: ${row[0]}`));
}

for (const phrase of [
  '语言', '查法官', '查法院', '各州数据', '各国国籍批准率',
  '全部移民法官', '美国各州移民法院庇护数据', '美国移民法院庇护通过率',
  '法官背景与任命信息', '结案总数', '批准', '拒绝', '其他'
]) assert.ok(rows.some((row) => row[0] === phrase), `missing full-site UI phrase: ${phrase}`);

assert.match(i18n, /new MutationObserver/, 'async data inserted after load must also be translated');
assert.match(i18n, /document\.documentElement\.dir = locale === 'ar' \? 'rtl' : 'ltr'/, 'Arabic must use RTL layout direction');
assert.match(i18n, /stateTraditional/, 'Traditional Chinese state names must not fall back to Simplified Chinese');
assert.match(i18n, /window\.AsylumI18n =/, 'the language selector must use the global i18n controller');

const pages = [
  'asylumjudge/index.html',
  'asylumjudge/trrb.html',
  'immigration-judge-approval-rate/index.html',
  'immigration-judge-approval-rate/states.html',
  'immigration-judge-approval-rate/courts.html',
  'immigration-judge-approval-rate/court-detail.html',
  'immigration-judge-approval-rate/detail.html',
  'immigration-judge-approval-rate/methodology.html'
];
for (const path of pages) {
  const html = readFileSync(path, 'utf8');
  const i18nIndex = html.indexOf('/asylumjudge/app-i18n.js');
  const brandIndex = html.indexOf('/asylumjudge/domain-brand.js');
  assert.ok(i18nIndex >= 0, `${path} must load global ten-language translations`);
  assert.ok(brandIndex > i18nIndex, `${path} must load translations before the language selector controller`);
}

const nationality = readFileSync('immigration-judge-approval-rate/china-dashboard-i18n.js', 'utf8');
for (const locale of ['en', 'es', 'fr', 'pt-BR', 'hi', 'zh-Hans', 'zh-Hant', 'ru', 'ar', 'tr']) {
  const pattern = locale === 'en' ? /const en =/ : new RegExp(`['"]?${locale.replace('-', '\\-')}['"]?\\s*:`);
  assert.match(nationality, pattern, `nationality dashboard must support ${locale}`);
}

console.log('AsylumJudge ten-language UI contract: PASS');
