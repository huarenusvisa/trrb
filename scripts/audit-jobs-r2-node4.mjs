import fs from 'node:fs';

const spec = fs.readFileSync('docs/JOBS-R2-LOCATION-AWARE-JOB-DISCOVERY-UX.md','utf8');
const html = fs.readFileSync('jobs/search.html','utf8');
const js = fs.readFileSync('jobs/search-r2-geo.js','utf8');
const sql = fs.readFileSync('supabase/migrations/20260817014000_jobs_r2_node4_human_geo_areas.sql','utf8');

const checks = [
  ['spec node 4 exists', /4\. 地理认知降维/.test(spec)],
  ['human-friendly area catalog exists', /create table if not exists public\.job_discovery_areas/.test(sql)],
  ['catalog retains standardized geography', /state_code[\s\S]*?city[\s\S]*?county[\s\S]*?borough[\s\S]*?neighborhood/.test(sql)],
  ['metro grouping is explicit', /metro_slug text/.test(sql) && /area_type text/.test(sql)],
  ['NYC metro supported', /'nyc-metro','纽约都会区'/.test(sql)],
  ['SF Bay Area supported', /'sf-bay-area','旧金山湾区'/.test(sql)],
  ['NYC common Chinese areas supported', /'flushing-ny','法拉盛'/.test(sql) && /'brooklyn-ny','布鲁克林'/.test(sql) && /'manhattan-ny','曼哈顿'/.test(sql)],
  ['Bay Area click-only children supported', /'san-francisco-ca','旧金山'/.test(sql) && /'oakland-ca','奥克兰'/.test(sql) && /'san-jose-ca','圣何塞'/.test(sql) && /'fremont-ca','费利蒙'/.test(sql)],
  ['catalog is public-read reference only', /enable row level security/.test(sql) && /job discovery areas public read/.test(sql)],
  ['catalog explicitly does not replace listings', /not a second job-listings data source/i.test(sql) && /canonical public\.job_listings/.test(sql)],
  ['region picker loads catalog', /from\('job_discovery_areas'\)/.test(js)],
  ['metro rows are headings and children are clickable', /row\.area_type === 'metro'/.test(js) && /data-human-area/.test(js)],
  ['click maps back to standard form fields', /state: row\.state_code/.test(js) && /city: row\.city/.test(js) && /county: row\.county/.test(js) && /borough: row\.borough/.test(js) && /neighborhood: row\.neighborhood/.test(js)],
  ['click-only flow submits without typing', /requestSubmit/.test(js)],
  ['UI explicitly reduces admin-geography burden', /不用理解州 \/ County \/ Borough/.test(js)],
  ['N4 script loaded on search page', /search-r2-geo\.js/.test(html)],
  ['mobile area groups collapse to one column', /human-area-groups\{grid-template-columns:1fr\}/.test(html)],
  ['no shadow listing table', !/create table if not exists public\.job_listings_r2/.test(sql)],
];

const failed = checks.filter(([,ok])=>!ok);
for (const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'}: ${name}`);
if (failed.length) {
  console.error(`JOBS-R2-N4 FAIL: ${failed.length}/${checks.length} checks failed`);
  process.exit(1);
}
console.log(`JOBS-R2-N4 PASS: ${checks.length}/${checks.length} checks passed`);
