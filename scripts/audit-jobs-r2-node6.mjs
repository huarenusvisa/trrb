import fs from 'node:fs';
const spec=fs.readFileSync('docs/JOBS-R2-LOCATION-AWARE-JOB-DISCOVERY-UX.md','utf8');
const search=fs.readFileSync('jobs/search.js','utf8');
const geo=fs.readFileSync('jobs/search-r2-geo.js','utf8');
const checks=[
 ['spec N6',/6\. PC高密度职位列表/.test(spec)],
 ['no long description in list renderer',!/renderList[\s\S]{0,1600}row\.description/.test(search)],
 ['compact desktop density',/min-width:861px/.test(geo)&&/min-height:96px/.test(geo)&&/padding:10px 13px/.test(geo)],
 ['title is primary and links to stable detail',/job-card-compact h2/.test(geo)&&/\/jobs\/listing\.html\?id=/.test(geo)],
 ['salary stays prominent',/class="salary"/.test(search)&&/job-card-compact \.salary/.test(geo)],
 ['location and distance stay visible',/locationText\(row\)/.test(search)&&/距找工地点/.test(search)],
 ['max four compact metadata pills from canonical renderer',(search.match(/<span class="pill">/g)||[]).length<=4],
 ['published time shown',/published_at/.test(geo)&&/relativeTime/.test(geo)],
 ['real review trust signal',/job_reviews/.test(geo)&&/communication_score/.test(geo)&&/accuracy_score/.test(geo)&&/★/.test(geo)],
 ['risk signal uses canonical R1 labels',/job_risk_labels/.test(geo)&&/风险提示/.test(geo)],
 ['no fake verification claim',!/手机已验证|企业认证|官方认证|verified employer/i.test(geo)],
 ['contact CTA',/查看并联系/.test(geo)&&/job-card-cta/.test(geo)],
 ['no large list imagery',!/result-card[\s\S]{0,400}<img|job-card-compact[\s\S]{0,400}background-image/.test(search+geo)],
 ['unified canonical job source',/from\('job_listings'\)/.test(geo)&&!/job_listings_r2|jobs_r2_listings/i.test(geo)]
];
const failed=checks.filter(([,ok])=>!ok); for(const [n,ok] of checks) console.log(`${ok?'PASS':'FAIL'}: ${n}`); if(failed.length){console.error(`JOBS-R2-N6 FAIL: ${failed.length}/${checks.length}`);process.exit(1)} console.log(`JOBS-R2-N6 PASS: ${checks.length}/${checks.length} checks passed`);