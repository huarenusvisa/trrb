import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const i18n = readFileSync('huarengongzuo/i18n.js', 'utf8');
const pages = [
  'huarengongzuo/index.html', 'jobs/index.html', 'jobs/publish.html', 'jobs/seeker.html',
  'jobs/manage.html', 'jobs/messages.html', 'jobs/contact.html', 'jobs/listing.html'
];
const expected = ['en','es','fr','pt-BR','hi','zh-Hans','zh-Hant','ru','ar','tr'];

assert.match(i18n, /const locales = \['en', 'es', 'fr', 'pt-BR', 'hi', 'zh-Hans', 'zh-Hant', 'ru', 'ar', 'tr'\]/, 'ten-language order changed');
for (const locale of expected) assert.match(i18n, new RegExp(`['"]${locale.replace('-', '\\-')}['"]`), `missing locale ${locale}`);
assert.match(i18n, /localStorage\.getItem\(storageKey\)/, 'saved language preference missing');
assert.match(i18n, /navigator\.languages/, 'browser language detection missing');
assert.match(i18n, /explicit \|\| stored \|\| browser \|\| 'zh-Hans'/, 'language precedence must be explicit, saved, browser, Simplified Chinese');
assert.match(i18n, /locale === 'ar' \? 'rtl' : 'ltr'/, 'Arabic RTL handling missing');
assert.match(i18n, /data-hg-language-select/, 'language selector missing');
assert.match(i18n, /data-i18n-skip/, 'user content translation escape hatch missing');
assert.ok((i18n.match(/^\s+\['/gm) || []).length >= 90, 'translation dictionary is unexpectedly small');

for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  assert.match(html, /\/huarengongzuo\/i18n\.js\?v=20260831-i18n-v1/, `${page} does not load shared i18n`);
}
const edge = readFileSync('netlify/edge-functions/huarengongzuo-job-prerender.ts', 'utf8');
assert.match(edge, /\/huarengongzuo\/i18n\.js\?v=20260831-i18n-v1/, 'server-rendered job detail missing i18n');
console.log('Huaren Gongzuo 10-language landing and preference contracts passed.');
