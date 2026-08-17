import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

for (let i=1;i<=9;i++) {
  const file=`scripts/audit-jobs-r2-node${i}.mjs`;
  if (!fs.existsSync(file)) {
    console.error(`JOBS-R2-N10 FAIL: missing ${file}`);
    process.exit(1);
  }
  console.log(`\n=== Revalidating JOBS-R2-N${i} ===`);
  const result=spawnSync(process.execPath,[file],{stdio:'inherit'});
  if (result.status!==0) {
    console.error(`JOBS-R2-N10 FAIL: N${i} revalidation failed`);
    process.exit(result.status || 1);
  }
}

const spec=fs.readFileSync('docs/JOBS-R2-LOCATION-AWARE-JOB-DISCOVERY-UX.md','utf8');
const html=fs.readFileSync('jobs/search.html','utf8');
const search=fs.readFileSync('jobs/search.js','utf8');
const discovery=fs.readFileSync('jobs/search-r2-discovery.js','utf8');
const geo=fs.readFileSync('jobs/search-r2-geo.js','utf8');
const mobile=fs.readFileSync('jobs/search-r2-mobile.js','utf8');
const admin=fs.readFileSync('admin/jobs-manager.js','utf8');
const governance=fs.readFileSync('admin/jobs-location-governance.js','utf8');
const r1=fs.readFileSync('docs/JOBS-01-US-RECRUITING-AND-JOB-SEEKING.md','utf8');
const n1sql=fs.readFileSync('supabase/migrations/20260817011000_jobs_r2_node1_search_location.sql','utf8');
const n7sql=fs.readFileSync('supabase/migrations/20260817017000_jobs_r2_node7_mobile_saves.sql','utf8');
const n9sql=fs.readFileSync('supabase/migrations/20260817019000_jobs_r2_node9_admin_location_governance.sql','utf8');
const all=[html,search,discovery,geo,mobile,admin,governance,n1sql,n7sql,n9sql].join('\n');

const checks=[
 ['fixed N1-N10 specification remains intact',Array.from({length:10},(_,i)=>new RegExp(`^${i+1}\\. `,'m').test(spec)).every(Boolean)],
 ['JOBS-R1 completion remains a hard prerequisite',/前置条件：JOBS-R1: 10\/10 PASS/.test(spec)&&/JOBS-R1: 10\/10 PASS/.test(r1)],
 ['canonical job_listings remains the listing source',/job_listings/.test(all)&&!/job_listings_r2|jobs_r2_listings/i.test(all)],
 ['unified auth/account location remains wired',/auth\.getUser/.test(search+mobile)&&/job_search_locations/.test(search+governance+n9sql)],
 ['GPS requires browser authorization and stores consent',/navigator\.geolocation/.test(search)&&/getCurrentPosition/.test(search)&&/location_consent_at:new Date\(\)\.toISOString\(\)/.test(search)],
 ['no IP provider fabricates precise distance',!/ipapi|ipinfo|ipgeolocation|geoip/i.test(search+mobile+geo+discovery)],
 ['no-location fallbacks remain ZIP region and all-US',/manual_zip/.test(search)&&/manual_region/.test(search)&&/mode:'all_us'/.test(search)],
 ['bidirectional category-region discovery remains active',/job_region_counts/.test(discovery)&&/job_category_counts/.test(discovery)],
 ['distance choices remain exactly usable at 5 10 25 50 miles',/5 miles/.test(html)&&/10 miles/.test(html)&&/25 miles/.test(html)&&/50 miles/.test(html)&&/p_radius_miles/.test(search)],
 ['PC compact scan experience remains active',/job-card-compact/.test(geo)&&/min-height:96px/.test(geo)&&/查看并联系/.test(geo)],
 ['mobile minimal feed remains active',/mobile-job-feed-head/.test(mobile)&&/附近/.test(mobile)&&/推荐/.test(mobile)&&/最新/.test(mobile)&&/最近/.test(mobile)&&/高薪/.test(mobile)&&/聊一聊/.test(mobile)],
 ['list/map and search-this-area remain active',/id="list-view"/.test(html)&&/id="map-view"/.test(html)&&/在这个区域找工作/.test(search)&&/manual_map/.test(search)],
 ['cross-region fixed search center does not claim GPS consent',/source:'manual_map'[\s\S]{0,450}location_consent_at:null/.test(search)&&/mode:'fixed_location'/.test(search)],
 ['admin remains unified with R1 review/report/risk governance',/job_reviews/.test(admin)&&/job_reports/.test(admin)&&/job_risk_labels/.test(admin)&&/jobs-location-governance\.js/.test(admin)],
 ['admin location governance is jobs-admin protected',/assert_jobs_admin/.test(governance)&&/is_jobs_admin/.test(n9sql)],
 ['admin does not render raw precise coordinates',/不显示原始经纬度/.test(governance)&&!/\$\{[^}]*row\.latitude[^}]*\}|\$\{[^}]*row\.longitude[^}]*\}/.test(governance)],
 ['saved jobs remain account-scoped canonical references',/job_listing_saves/.test(n7sql)&&/references public\.job_listings/.test(n7sql)&&/auth\.uid\(\) = user_id/.test(n7sql)],
 ['stable public listing/contact URLs remain present',/\/jobs\/listing\.html\?id=/.test(geo)&&/\/jobs\/contact\.html\?id=/.test(mobile)],
 ['no forced home-address collection added',!/homeAddress|家庭住址|家庭地址/.test(search+mobile+html)],
 ['R1 lifecycle/privacy/anti-fraud requirements remain documented',/生命周期/.test(r1)&&/隐私/.test(r1)&&/反诈骗/.test(r1)&&/SEO/i.test(r1)]
];

const failed=checks.filter(([,ok])=>!ok);
console.log('\n=== JOBS-R2 global production/regression checks ===');
for (const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'}: ${name}`);
if (failed.length) {
  console.error(`JOBS-R2-N10 FAIL: ${failed.length}/${checks.length} global checks failed`);
  process.exit(1);
}
console.log(`JOBS-R2-N10 PASS: ${checks.length}/${checks.length} global checks passed`);
console.log('JOBS-R2: 10/10 PASS');
