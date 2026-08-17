import fs from 'node:fs';

const spec = fs.readFileSync('docs/JOBS-R2-LOCATION-AWARE-JOB-DISCOVERY-UX.md','utf8');
const html = fs.readFileSync('jobs/search.html','utf8');
const js = fs.readFileSync('jobs/search.js','utf8');
const sql = fs.readFileSync('supabase/migrations/20260817012000_jobs_r2_node2_pc_header.sql','utf8');

const checks = [
  ['spec node 2 exists', /2\. PC极简找工头部/.test(spec)],
  ['job selector present', /找什么工作？[\s\S]*id="category"/.test(html)],
  ['job-search location selector present', /想在哪里？[\s\S]*id="location-trigger"/.test(html)],
  ['search input explicitly optional', /搜索（可选）/.test(html) && /不会打字可留空/.test(html)],
  ['four location choices', /使用当前位置/.test(html) && /ZIP Code/.test(html) && /选择地区/.test(html) && /全美国/.test(html)],
  ['privacy copy says job-search location not home address', /找工地点[^。]*不是家庭住址/.test(html)],
  ['precise location not requested until click', /getCurrentPosition/.test(js) && /use-location[^\n]*addEventListener/.test(js)],
  ['account location is loaded from canonical table', /from\('job_search_locations'\)\.select/.test(js)],
  ['account location is persisted by upsert', /from\('job_search_locations'\)\.upsert/.test(js)],
  ['logged-in saved coordinates can seed nearby search', /coords = data\.latitude != null/.test(js) && /radius'\)\.value = '25'/.test(js)],
  ['ZIP remains functional without GPS', /mode:'zip',source:'manual_zip'/.test(js) && /p_postal_code: postalCode/.test(js)],
  ['all-US clears precise location', /mode:'all_us',source:'all_us'/.test(js) && /latitude:null,longitude:null/.test(js)],
  ['region chooser exposes manual hierarchy without forcing it initially', /id="choose-region"/.test(html) && /advanced-filters/.test(js)],
  ['existing unified canonical search RPC retained', /create or replace function public\.search_job_listings/.test(sql) && /from public\.job_listings j/.test(sql)],
  ['ZIP added to canonical RPC', /p_postal_code text default null/.test(sql) && /j\.postal_code/.test(sql)],
  ['radius filtering only works with explicit coordinates', /p_radius_miles is null or p_latitude is null or p_longitude is null/.test(sql)],
  ['no second listings table', !/create table if not exists public\.job_listings_r2/.test(sql)],
  ['mobile collapses compactly', /@media\(max-width:560px\)/.test(html)],
];

const failed = checks.filter(([,ok]) => !ok);
for (const [name,ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
if (failed.length) {
  console.error(`JOBS-R2-N2 FAIL: ${failed.length}/${checks.length} checks failed`);
  process.exit(1);
}
console.log(`JOBS-R2-N2 PASS: ${checks.length}/${checks.length} checks passed`);
