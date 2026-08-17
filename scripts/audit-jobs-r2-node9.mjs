import fs from 'node:fs';
const spec=fs.readFileSync('docs/JOBS-R2-LOCATION-AWARE-JOB-DISCOVERY-UX.md','utf8');
const search=fs.readFileSync('jobs/search.js','utf8');
const mobile=fs.readFileSync('jobs/search-r2-mobile.js','utf8');
const discovery=fs.readFileSync('jobs/search-r2-discovery.js','utf8');
const admin=fs.readFileSync('admin/jobs-manager.js','utf8');
const governance=fs.readFileSync('admin/jobs-location-governance.js','utf8');
const policy=fs.readFileSync('supabase/migrations/20260817019000_jobs_r2_node9_admin_location_governance.sql','utf8');
const saveSql=fs.readFileSync('supabase/migrations/20260817017000_jobs_r2_node7_mobile_saves.sql','utf8');
const checks=[
 ['spec N9 exists',/9\. Web\/APP\/账号\/admin统一闭环/.test(spec)],
 ['desktop and responsive mobile share canonical account location table',/job_search_locations/.test(search)&&/search-r2-mobile\.js/.test(discovery)],
 ['account location is loaded after unified auth',/client\.auth\.getUser/.test(search)&&/loadAccountLocation/.test(search)&&/from\('job_search_locations'\)/.test(search)],
 ['all location changes persist to same account preference',/persistLocation/.test(search)&&/mode:'current_location'/.test(search)&&/mode:'zip'/.test(search)&&/mode:'all_us'/.test(search)&&/source:'manual_region'/.test(search)&&/source:'manual_map'/.test(search)],
 ['follow-current and fixed-center semantics both exist',/follow_current_location:true/.test(search)&&/follow_current_location:false/.test(search)&&/fixed_location/.test(search)],
 ['mobile saves use same unified auth and canonical listings',/client\.auth\.getUser/.test(mobile)&&/job_listing_saves/.test(mobile)&&/references public\.job_listings/.test(saveSql)],
 ['existing admin remains same jobs management surface',/job_listings/.test(admin)&&/job_seeker_posts/.test(admin)&&/job_reviews/.test(admin)&&/job_reports/.test(admin)&&/job_risk_labels/.test(admin)],
 ['existing admin dynamically loads R2 location governance',/jobs-location-governance\.js/.test(admin)&&/data-jobs-r2-location-admin/.test(admin)],
 ['location governance is protected by existing jobs-admin authorization',/assert_jobs_admin/.test(governance)&&/public\.is_jobs_admin\(\)/.test(policy)],
 ['admin sees location mode/source/public region/follow state',/mode,source,public_label/.test(governance)&&/follow_current_location/.test(governance)&&/找工模式/.test(governance)&&/来源/.test(governance)],
 ['admin UI deliberately avoids rendering raw coordinate values',/不显示原始经纬度/.test(governance)&&!/\$\{[^}]*row\.latitude[^}]*\}|\$\{[^}]*row\.longitude[^}]*\}/.test(governance)],
 ['GPS authorization remains explicit',/navigator\.geolocation/.test(search)&&/location_consent_at:new Date\(\)\.toISOString\(\)/.test(search)],
 ['manual locations never claim GPS consent',/source:'manual_region'[\s\S]{0,450}location_consent_at:null/.test(search)&&/source:'manual_map'[\s\S]{0,450}location_consent_at:null/.test(search)],
 ['R1 review anti-fraud governance remains wired',/job_reviews/.test(admin)&&/job_reports/.test(admin)&&/job_risk_labels/.test(admin)],
 ['no second jobs admin or shadow listing source',!/jobs_r2_admin|job_listings_r2|jobs_r2_listings/i.test(admin+governance+policy+mobile)]
];
const failed=checks.filter(([,ok])=>!ok); for(const [n,ok] of checks) console.log(`${ok?'PASS':'FAIL'}: ${n}`); if(failed.length){console.error(`JOBS-R2-N9 FAIL: ${failed.length}/${checks.length}`);process.exit(1)} console.log(`JOBS-R2-N9 PASS: ${checks.length}/${checks.length} checks passed`);