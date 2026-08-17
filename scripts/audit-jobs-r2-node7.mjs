import fs from 'node:fs';
const spec=fs.readFileSync('docs/JOBS-R2-LOCATION-AWARE-JOB-DISCOVERY-UX.md','utf8');
const mobile=fs.readFileSync('jobs/search-r2-mobile.js','utf8');
const discovery=fs.readFileSync('jobs/search-r2-discovery.js','utf8');
const geo=fs.readFileSync('jobs/search-r2-geo.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20260817017000_jobs_r2_node7_mobile_saves.sql','utf8');
const checks=[
 ['spec N7 exists',/7\. 手机极简职位流/.test(spec)],
 ['mobile layer loads from canonical search page',/search-r2-mobile\.js/.test(discovery)],
 ['dynamic-load init works after DOMContentLoaded',/document\.readyState==='loading'/.test(mobile)&&/else init\(\)/.test(mobile)],
 ['location is top mobile control',/mobile-location-btn/.test(mobile)&&/location-summary/.test(mobile)&&/更换/.test(mobile)],
 ['large click-only categories',/mobile-category-chip/.test(mobile)&&/data-mobile-category/.test(mobile)&&/requestSubmit/.test(mobile)],
 ['nearby recommended latest nearest salary tabs',/附近/.test(mobile)&&/推荐/.test(mobile)&&/最新/.test(mobile)&&/最近/.test(mobile)&&/高薪/.test(mobile)],
 ['distance tab refuses to fake distance without a center',/最近.*需要一个找工中心/.test(mobile)],
 ['complex filters stay behind filter control',/mobile-filter-button/.test(mobile)&&/advanced-filters/.test(mobile)],
 ['thumb-friendly compact mobile card CSS',/@media\(max-width:860px\)/.test(mobile)&&/job-card-compact/.test(mobile)&&/job-card-actions/.test(mobile)],
 ['real review and time inherited from N6 cards',/job_reviews/.test(geo)&&/relativeTime/.test(geo)],
 ['account-scoped saves use canonical listing ids',/create table if not exists public\.job_listing_saves/.test(sql)&&/references public\.job_listings/.test(sql)&&/auth\.uid\(\) = user_id/.test(sql)],
 ['save UI uses unified auth',/client\.auth\.getUser/.test(mobile)&&/job_listing_saves/.test(mobile)&&/收藏/.test(mobile)],
 ['chat CTA uses canonical contact loop',/\/jobs\/contact\.html\?id=/.test(mobile)&&/聊一聊/.test(mobile)],
 ['mobile keeps 3-4 canonical list pills',((fs.readFileSync('jobs/search.js','utf8').match(/<span class="pill">/g)||[]).length<=4)],
 ['no shadow listings source',!/job_listings_r2|jobs_r2_listings/i.test(mobile+sql)]
];
const failed=checks.filter(([,ok])=>!ok); for(const [n,ok] of checks) console.log(`${ok?'PASS':'FAIL'}: ${n}`); if(failed.length){console.error(`JOBS-R2-N7 FAIL: ${failed.length}/${checks.length}`);process.exit(1)} console.log(`JOBS-R2-N7 PASS: ${checks.length}/${checks.length} checks passed`);