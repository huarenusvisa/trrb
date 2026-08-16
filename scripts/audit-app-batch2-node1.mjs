import fs from 'node:fs';

const mobile = fs.readFileSync('apps/mobile/src/api/trrb.ts','utf8');
const homeApi = fs.readFileSync('netlify/functions/public-home-articles.js','utf8');
const checks = [
  ['mobile uses production TRRB functions host', /https:\/\/trrb\.net\/\.netlify\/functions/.test(mobile)],
  ['mobile home reads public-home-articles', /public-home-articles/.test(mobile)],
  ['mobile article pages read public-articles', /public-articles/.test(mobile)],
  ['mobile detail reads public-article', /public-article\?/.test(mobile)],
  ['production API filters published rows', /status:\s*["']eq\.published["']/.test(homeApi)],
  ['production API orders by published_at first', /published_at\.desc/.test(homeApi)],
  ['production API falls back to created_at ordering second', /created_at\.desc/.test(homeApi)],
  ['production API returns canonical article fields', /id,title,slug,summary,content,category_name,cover_image,author,status,published_at,created_at/.test(homeApi)],
  ['mobile newest-first helper prioritizes published_at', /item\.published_at\s*\|\|\s*item\.created_at/.test(mobile)],
  ['no alternate API base in mobile news client', (mobile.match(/https:\/\//g) || []).length === 1]
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`APP BATCH 2 NODE 1: FAIL (${failed}/${checks.length} failed)`);
  process.exit(1);
}
console.log(`APP BATCH 2 NODE 1: PASS (${checks.length}/${checks.length})`);
