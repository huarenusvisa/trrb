import fs from 'node:fs';

// Read-only compatibility audit. This command previously rewrote article.html
// and articles-home.js and could bypass the unified homepage bundle if run on a
// modern checkout.

const articleHtml = fs.readFileSync('article.html', 'utf8');
const home = fs.readFileSync('articles-home.js', 'utf8');
const articleEdge = fs.readFileSync('netlify/edge-functions/article-prerender.ts', 'utf8');
const legacyGuard = fs.readFileSync('netlify/edge-functions/00-legacy-article-query-guard.ts', 'utf8');

const checks = [
  ['homepage uses unified live bundle', home.includes('fetchUnifiedHomeBundle') && home.includes('public-home-bundle')],
  ['numeric archive index remains available on legacy article template', articleHtml.includes('articles-home-index.js?v=20260819-archive')],
  ['legacy archive loader remains available on legacy article template', articleHtml.includes('article.js?v=29.8-legacy-archive-rescue')],
  ['article edge knows static archive IDs', articleEdge.includes('archiveHasId')],
  ['legacy query guard knows static archive IDs', legacyGuard.includes('archiveHasId')]
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
}
console.log(`HOME_LIVE_LEGACY_READ_ONLY_AUDIT=true checks=${checks.length} failures=${failures}`);
if (failures) process.exit(1);
