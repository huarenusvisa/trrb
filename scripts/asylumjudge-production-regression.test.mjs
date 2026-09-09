import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '.netlify/asylumjudge-bundle/public';
const locales = ['en', 'es', 'fr', 'pt-br', 'hi', 'zh-hant', 'ru', 'ar', 'tr'];
const read = (path) => readFileSync(join(OUT, path), 'utf8');

assert.ok(existsSync(join(OUT, 'index.html')), 'Chinese root homepage must exist');
for (const locale of locales) {
  assert.ok(existsSync(join(OUT, locale, 'index.html')), `/${locale}/ must have a generated index.html`);
  assert.ok(existsSync(join(OUT, locale, 'judge-backgrounds', 'index.html')), `/${locale}/judge-backgrounds/ must exist`);
}

const zhKeyword = read('asylum-judge-approval-rate/index.html');
const enKeyword = read('en/asylum-judge-rating/index.html');
assert.match(zhKeyword, /<h1>美国庇护法官通过率查询<\/h1>/, 'Chinese keyword landing page must target 庇护法官通过率');
assert.match(zhKeyword, /canonical" href="https:\/\/asylumjudge\.com\/asylum-judge-approval-rate\//, 'Chinese keyword page canonical must be stable');
assert.match(enKeyword, /<h1>Asylum Judge Rating and Approval Rate Lookup<\/h1>/, 'English keyword landing page must target asylum judge rating');
assert.match(enKeyword, /canonical" href="https:\/\/asylumjudge\.com\/en\/asylum-judge-rating\//, 'English keyword page canonical must be stable');
assert.match(enKeyword, /FAQPage/, 'English keyword page must contain explanatory FAQ schema');
assert.match(zhKeyword, /FAQPage/, 'Chinese keyword page must contain explanatory FAQ schema');

const rootHome = read('index.html');
const enHome = read('en/index.html');
assert.match(rootHome, /href="\/asylum-judge-approval-rate\//, 'Chinese home must internally link to the core approval-rate landing page');
assert.match(enHome, /href="\/en\/asylum-judge-rating\//, 'English home must internally link to the asylum-judge-rating landing page');
assert.match(rootHome, /language-route-hardening\.js/, 'Chinese home must load language-route hardening');
assert.match(enHome, /language-route-hardening\.js/, 'English home must load language-route hardening');

const hardening = readFileSync('asylumjudge/language-route-hardening.js', 'utf8');
assert.match(hardening, /pathForLocale/, 'language hardening must canonicalize equivalent locale paths');
assert.match(hardening, /stopImmediatePropagation/, 'language hardening must prevent the legacy handler from racing a canonical route change');
assert.match(hardening, /\/en\/asylum-judge-rating\//, 'language hardening must map the English keyword page');

const redirects = read('_redirects');
for (const locale of locales) {
  assert.match(redirects, new RegExp(`/${locale}/methodology /methodology/ 301!`), `/${locale}/methodology must fall back to the only indexable methodology page instead of 404`);
  assert.match(redirects, new RegExp(`/${locale}/methodology/ /methodology/ 301!`), `/${locale}/methodology/ must fall back instead of 404`);
}
assert.match(redirects, /\/asylum-judge-rating\/ \/en\/asylum-judge-rating\/ 301!/, 'English keyword alias must canonicalize to /en/');

const sitemap = read('sitemap-static.xml');
assert.match(sitemap, /https:\/\/asylumjudge\.com\/asylum-judge-approval-rate\//, 'static sitemap must include the Chinese keyword landing page');
assert.match(sitemap, /https:\/\/asylumjudge\.com\/en\/asylum-judge-rating\//, 'static sitemap must include the English keyword landing page');

function firstProfile(prefix) {
  const base = join(OUT, prefix, 'judges');
  const name = readdirSync(base, { withFileTypes: true }).find((entry) => entry.isDirectory())?.name;
  assert.ok(name, `${prefix || 'zh'} must contain generated judge profiles`);
  return read(join(prefix, 'judges', name, 'index.html'));
}

const zhJudge = firstProfile('');
const enJudge = firstProfile('en');
assert.doesNotMatch(zhJudge, /TRRB · EOIR JUDGE PROFILE/, 'Chinese AsylumJudge profiles must not expose the TRRB profile brand');
assert.doesNotMatch(enJudge, /TRRB · EOIR JUDGE PROFILE/, 'English AsylumJudge profiles must not expose the TRRB profile brand');
assert.match(zhJudge, /ASYLUMJUDGE · IMMIGRATION JUDGE PROFILE/, 'Chinese judge profile must use AsylumJudge branding');
assert.match(enJudge, /ASYLUMJUDGE · IMMIGRATION JUDGE PROFILE/, 'English judge profile must use AsylumJudge branding');
assert.match(zhJudge, /href="\/asylum-judge-approval-rate\//, 'Chinese judge profiles must feed internal authority to the core landing page');
assert.match(enJudge, /href="\/en\/asylum-judge-rating\//, 'English judge profiles must feed internal authority to the core landing page');

console.log('AsylumJudge production regression checks passed: multilingual routes, keyword intent, branding, sitemap, and internal links are coherent.');
