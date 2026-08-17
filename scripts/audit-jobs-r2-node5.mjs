import fs from 'node:fs';

const spec = fs.readFileSync('docs/JOBS-R2-LOCATION-AWARE-JOB-DISCOVERY-UX.md','utf8');
const html = fs.readFileSync('jobs/search.html','utf8');
const search = fs.readFileSync('jobs/search.js','utf8');
const geo = fs.readFileSync('jobs/search-r2-geo.js','utf8');
const areaSql = fs.readFileSync('supabase/migrations/20260817014000_jobs_r2_node4_human_geo_areas.sql','utf8');
const locationSql = fs.readFileSync('supabase/migrations/20260817011000_jobs_r2_node1_search_location.sql','utf8');

const checks = [
  ['spec node 5 exists', /5\. 距离感知与附近工作/.test(spec)],
  ['GPS is explicit user-authorized browser geolocation', /navigator\.geolocation/.test(search) && /getCurrentPosition/.test(search) && /location_consent_at:new Date\(\)\.toISOString\(\)/.test(search)],
  ['GPS persists consented current-location mode', /mode:'current_location'/.test(search) && /source:'device_geolocation'/.test(search) && /follow_current_location:true/.test(search)],
  ['rejected GPS keeps non-GPS fallbacks available', /未获得定位授权/.test(search) && /ZIP、选择地区或查看全美国工作/.test(search)],
  ['distance RPC parameters use an actual search center', /p_latitude: coords\?\.latitude/.test(search) && /p_longitude: coords\?\.longitude/.test(search) && /p_radius_miles: coords/.test(search)],
  ['only supported radius choices are exposed', /<option value="5">5 miles<\/option>/.test(html) && /<option value="10">10 miles<\/option>/.test(html) && /<option value="25">25 miles<\/option>/.test(html) && /<option value="50">50 miles<\/option>/.test(html)],
  ['selected common areas carry center coordinates', /center_latitude/.test(areaSql) && /center_longitude/.test(areaSql) && /default_radius_miles/.test(areaSql)],
  ['area picker requests centers and dispatches selection', /center_latitude,center_longitude,default_radius_miles/.test(geo) && /jobs:r2-search-area-selected/.test(geo)],
  ['selected area event is consumed by main search', /addEventListener\('jobs:r2-search-area-selected'/.test(search) && /applySelectedArea\(event\.detail\)/.test(search)],
  ['selected area becomes distance-aware center', /coords = \{latitude, longitude\}/.test(search) && /\$\('radius'\)\.value = String\(radius\)/.test(search) && /\$\('sort'\)\.value = 'distance'/.test(search)],
  ['manual area uses an allowed non-GPS source', /source:'manual_region'/.test(search) && /manual_region/.test(locationSql) && /location_consent_at:null/.test(search) && /follow_current_location:false/.test(search)],
  ['selected area remains account-synced', /await persistLocation\(\{[\s\S]*?source:'manual_region'/.test(search)],
  ['list shows distance from chosen job-search center', /距找工地点/.test(search) && /row\.distance_miles/.test(search)],
  ['map also shows center and listing distance', /当前找工中心/.test(search) && /renderMap/.test(search) && /distance_miles/.test(search)],
  ['radius is disabled when there is no trustworthy center', /if \(\$\('radius'\)\.value && !coords\) \$\('radius'\)\.value = ''/.test(search)],
  ['IP is not used to fabricate precise coordinates', !/ipapi|ipinfo|ipgeolocation|geoip/i.test(search)],
  ['ZIP remains usable without GPS', /mode:'zip'/.test(search) && /source:'manual_zip'/.test(search)],
  ['all-US remains usable without coordinates', /mode:'all_us'/.test(search) && /latitude:null,longitude:null/.test(search)],
  ['no shadow listings source introduced', !/job_listings_r2|jobs_r2_listings/i.test(search + geo + areaSql)],
];

const failed = checks.filter(([,ok]) => !ok);
for (const [name,ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
if (failed.length) {
  console.error(`JOBS-R2-N5 FAIL: ${failed.length}/${checks.length} checks failed`);
  process.exit(1);
}
console.log(`JOBS-R2-N5 PASS: ${checks.length}/${checks.length} checks passed`);