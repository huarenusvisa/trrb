import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const read = (relative) => readFile(join(root, relative), 'utf8');
const [html, js, css, home, routes, built] = await Promise.all([
  read('immigration-judge-approval-rate/compare.html'),
  read('immigration-judge-approval-rate/compare.js'),
  read('immigration-judge-approval-rate/compare.css'),
  read('asylumjudge/index.html'),
  read('scripts/build-asylumjudge-site.mjs'),
  read('.netlify/asylumjudge-bundle/public/compare/index.html')
]);

assert.match(home, /href="\/compare"/, 'homepage must link to judge comparison');
assert.match(html, /id="compare-search"/);
assert.match(html, /id="compare-trend"/);
assert.match(html, /id="compare-nationalities"/);
assert.match(html, /id="compare-backgrounds"/);
assert.match(js, /selected\.length >= 4/, 'comparison must cap selection at four judges');
assert.match(js, /selected\.length < 2/, 'comparison must require at least two judges');
assert.match(js, /immigration-judges\?mode=all/, 'picker must use the complete judge dataset');
assert.match(js, /immigration-judges\?mode=detail/, 'comparison must load each judge detail dataset');
assert.match(js, /merits\(row\) >= 50/, 'yearly trend must enforce the sample threshold');
assert.match(js, /searchParams\.set\('judges'/, 'selection must be shareable through the URL');
assert.match(routes, /\/compare \/immigration-judge-approval-rate\/compare\.html 200/);
assert.match(routes, /`\/\$\{locale\}\/compare/);
assert.match(css, /grid-template-columns:repeat\(var\(--judge-count/);
assert.match(built, /<link rel="canonical" href="https:\/\/asylumjudge\.com\/compare\/">/);
assert.match(built, /<meta name="robots" content="index,follow,/);

console.log('AsylumJudge judge comparison contract: PASS');
