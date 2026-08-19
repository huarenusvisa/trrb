import fs from 'node:fs';

// Read-only compatibility audit. Historical versions of this command patched
// article-prerender.ts in place; modern routing owns these rules directly.

const edge = fs.readFileSync('netlify/edge-functions/article-prerender.ts', 'utf8');
const guard = fs.readFileSync('netlify/edge-functions/00-legacy-article-query-guard.ts', 'utf8');
const articleHtml = fs.readFileSync('article.html', 'utf8');

const checks = [
  ['numeric archive IDs pass to the static loader when valid', edge.includes('archiveHasId') && edge.includes('return context.next()')],
  ['invalid numeric archive IDs are retired with 410', edge.includes('status: 410') && edge.includes('retired-archive-id')],
  ['wp-prefixed static archive links normalize to numeric IDs', guard.includes('wordpress-prefix-to-static-archive')],
  ['legacy archive template still loads the static index', articleHtml.includes('articles-home-index.js?v=20260819-archive')],
  ['legacy archive template still loads article.js', articleHtml.includes('article.js?v=29.8-legacy-archive-rescue')]
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
}
console.log(`ARCHIVED_ARTICLE_ROUTE_READ_ONLY_AUDIT=true checks=${checks.length} failures=${failures}`);
if (failures) process.exit(1);
