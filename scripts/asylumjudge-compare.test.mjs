import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const read = (relative) => readFile(join(root, relative), 'utf8');
const [html, js, css, home, routes, built, seoAudit] = await Promise.all([
  read('immigration-judge-approval-rate/compare.html'),
  read('immigration-judge-approval-rate/compare.js'),
  read('immigration-judge-approval-rate/compare.css'),
  read('asylumjudge/index.html'),
  read('scripts/build-asylumjudge-site.mjs'),
  read('.netlify/asylumjudge-bundle/public/compare/index.html'),
  read('scripts/seo-integrity-audit.mjs')
]);

assert.match(home, /href="\/compare"/, 'homepage must link to judge comparison');
assert.match(html, /id="compare-search"/);
assert.match(html, /id="compare-search"[^>]*role="combobox"[^>]*aria-autocomplete="list"[^>]*aria-controls="compare-search-results"[^>]*aria-expanded="false"/);
assert.match(html, /id="compare-search-results"[^>]*role="listbox"/);
assert.match(html, /id="compare-trend"/);
assert.match(html, /id="compare-nationalities"/);
assert.match(html, /id="compare-backgrounds"/);
assert.match(html, /app-i18n\.js\?v=8/);
assert.match(html, /compare\.js\?v=4/);
assert.match(html, /compare\.css\?v=4/);
for (const locale of ['en', 'zh-Hans', 'zh-Hant', 'es', 'fr', 'pt-BR', 'hi', 'ru', 'ar', 'tr']) {
  assert.match(js, new RegExp(`['"]?${locale.replace('-', '\\-')}['"]?\\s*:\\s*\\{[^}]*retry:`), `retry action must support ${locale}`);
}
for (const locale of ['es', 'fr', 'pt-BR', 'hi', 'ru', 'ar', 'tr']) {
  assert.match(js, new RegExp(`['"]?${locale.replace('-', '\\-')}['"]?\\s*:\\s*\\{\\s*title:`), `comparison copy must support ${locale}`);
  assert.match(js, new RegExp(`['"]?${locale.replace('-', '\\-')}['"]?\\s*:\\s*\\{\\s*remove:`), `dynamic comparison labels must support ${locale}`);
}
assert.match(js, /selected\.length >= 4/, 'comparison must cap selection at four judges');
assert.match(js, /selected\.length < 2/, 'comparison must require at least two judges');
assert.match(js, /immigration-judges\?mode=all/, 'picker must use the complete judge dataset');
assert.match(js, /immigration-judges\?mode=detail/, 'comparison must load each judge detail dataset');
assert.match(js, /merits\(row\) >= 50/, 'yearly trend must enforce the sample threshold');
assert.match(js, /searchParams\.set\('judges'/, 'selection must be shareable through the URL');
assert.match(js, /asylumjudge:localechange[\s\S]*renderSelected\(\)[\s\S]*renderComparison\(\)/, 'changing language must rerender dynamic comparison results');
assert.match(js, /role="option"[^>]*aria-selected="false"[^>]*tabindex="-1"/, 'search results must expose non-tabbable ARIA options');
assert.match(js, /aria-activedescendant/, 'combobox must announce the active search result');
assert.match(js, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]\.includes\(event\.key\)/, 'combobox must support directional and boundary navigation');
assert.match(js, /event\.key === 'Escape'/, 'combobox must close with Escape');
assert.match(js, /event\.key === 'Enter'/, 'combobox must select with Enter');
assert.match(js, /class="compare-error" role="alert"/, 'load errors must be announced to assistive technology');
assert.match(js, /data-retry="\$\{scope\}"/, 'load errors must provide a retry action');
assert.match(js, /retry\.dataset\.retry === 'details'\) loadDetails\(\)[\s\S]*else load\(\)/, 'retry must reload the failed dataset without a page refresh');
assert.doesNotMatch(js, />No matching judge</, 'empty search results must use localized copy');
assert.doesNotMatch(js, />View full profile/, 'judge profile links must use localized copy');
assert.match(routes, /\/compare \/immigration-judge-approval-rate\/compare\.html 200/);
assert.match(routes, /`\/\$\{locale\}\/compare/);
assert.match(seoAudit, /ROUTE_PREFIXES[\s\S]*["']compare["']/, 'SEO audit must recognize the clean comparison route');
assert.match(css, /grid-template-columns:repeat\(var\(--judge-count/);
assert.match(css, /text-align:start/, 'search results must follow the active writing direction');
assert.match(css, /\.compare-search-result\.is-active/, 'keyboard-active options must have a visible highlight');
assert.match(css, /border-inline-start:4px/, 'comparison notices must place emphasis on the logical leading edge');
assert.match(css, /\.compare-error button:focus-visible/, 'retry button must expose a visible keyboard focus state');
assert.doesNotMatch(css, /\.compare-search-result\{[^}]*text-align:left/, 'Arabic search results must not be forced left');
assert.match(built, /<link rel="canonical" href="https:\/\/asylumjudge\.com\/compare\/">/);
assert.match(built, /<meta name="robots" content="index,follow,/);

console.log('AsylumJudge judge comparison contract: PASS');
