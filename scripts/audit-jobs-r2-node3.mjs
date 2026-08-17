import fs from 'node:fs';

const spec = fs.readFileSync('docs/JOBS-R2-LOCATION-AWARE-JOB-DISCOVERY-UX.md','utf8');
const html = fs.readFileSync('jobs/search.html','utf8');
const js = fs.readFileSync('jobs/search-r2-discovery.js','utf8');
const sql = fs.readFileSync('supabase/migrations/20260817013000_jobs_r2_node3_bidirectional_counts.sql','utf8');

const checks = [
  ['spec node 3 exists', /3\. 职位↔地区双向联动/.test(spec)],
  ['region hints UI present', /id="region-hints"/.test(html) && /哪里机会多/.test(html)],
  ['category hints UI present', /id="category-hints"/.test(html) && /这里缺什么人/.test(html)],
  ['region count RPC uses canonical listings', /function public\.job_region_counts/.test(sql) && /from public\.job_listings j/.test(sql)],
  ['category count RPC joins canonical categories', /function public\.job_category_counts/.test(sql) && /join public\.job_categories c/.test(sql)],
  ['counts only open US jobs', (sql.match(/j\.country_code='US'[\s\S]*?j\.status='open'/g) || []).length >= 2],
  ['job selection loads live region counts', /category[^\n]*addEventListener\('change', loadRegionHints\)/.test(js) && /rpc\('job_region_counts'/.test(js)],
  ['area selection loads live category counts', /rpc\('job_category_counts'/.test(js) && /loadCategoryHints/.test(js)],
  ['region count buttons are clickable', /data-state/.test(js) && /closest\('\[data-state\]'\)/.test(js)],
  ['category count buttons are clickable', /data-category/.test(js) && /closest\('\[data-category\]'\)/.test(js)],
  ['clicking a state updates filters and submits without typing', /\$\('state'\)\.value = button\.dataset\.state/.test(js) && /requestSubmit/.test(js)],
  ['clicking a category updates selector and submits without typing', /\$\('category'\)\.value = button\.dataset\.category/.test(js)],
  ['live counts displayed in buttons', /job_count/.test(js)],
  ['N3 script loaded on search page', /search-r2-discovery\.js/.test(html)],
  ['no second jobs data source', !/job_listings_r2/.test(sql) && !/job_categories_r2/.test(sql)],
];

const failed = checks.filter(([,ok]) => !ok);
for (const [name,ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
if (failed.length) {
  console.error(`JOBS-R2-N3 FAIL: ${failed.length}/${checks.length} checks failed`);
  process.exit(1);
}
console.log(`JOBS-R2-N3 PASS: ${checks.length}/${checks.length} checks passed`);
