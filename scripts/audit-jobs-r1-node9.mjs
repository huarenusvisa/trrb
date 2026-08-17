import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20260817009000_jobs_r1_node9_lifecycle_seo_governance.sql');
const manage=read('jobs/manage.js');
const detail=read('jobs/listing.js');
const admin=read('admin/jobs-lifecycle.js');
const adminHtml=read('admin/jobs-lifecycle.html');
const search=read('jobs/search.js');
const spec=read('docs/JOBS-01-US-RECRUITING-AND-JOB-SEEKING.md');
const n8=read('scripts/audit-jobs-r1-node8.mjs');
const checks=[
 ['N8 acceptance predecessor',/JOBS-R1-N8 PASS/.test(n8)],
 ['lifecycle audit table',/create table if not exists public\.job_lifecycle_events/.test(migration)],
 ['listing lifecycle trigger',/jobs_listing_lifecycle/.test(migration)&&/from_status/.test(migration)&&/to_status/.test(migration)],
 ['seeker lifecycle trigger',/jobs_seeker_lifecycle/.test(migration)],
 ['current search excludes ended records',/job_listings_current/.test(migration)&&/status='open'/.test(migration)&&/moderation_hold=false/.test(migration)],
 ['owner listing lifecycle controls',/filled/.test(manage)&&/paused/.test(manage)&&/unlisted/.test(manage)&&/deleted/.test(manage)&&/open/.test(manage)],
 ['owner seeker lifecycle controls',/found/.test(manage)&&/seeking/.test(manage)],
 ['stable permanent listing URL',/\/jobs\/listing\.html\?id=/.test(manage)&&/永久记录ID/.test(detail)],
 ['ended history marked ended',/此招聘已结束/.test(detail)&&/不会混入当前招聘搜索/.test(detail)],
 ['search uses canonical RPC',/rpc\('search_job_listings'/.test(search)],
 ['admin same-source lifecycle visibility',/job_listings/.test(admin)&&/job_seeker_posts/.test(admin)&&/job_lifecycle_events/.test(admin)],
 ['admin matching governance actions',/data-life-status/.test(admin)&&/moderation_hold/.test(admin)&&/admin_governance/.test(admin)],
 ['admin surface exists under admin',/招聘求职生命周期、SEO与治理/.test(adminHtml)&&/jobs-lifecycle\.js/.test(adminHtml)],
 ['safety records survive public deletion',/job_reports/.test(read('supabase/migrations/20260817008000_jobs_r1_node8_reviews_reports.sql'))&&/on delete restrict/.test(read('supabase/migrations/20260817008000_jobs_r1_node8_reviews_reports.sql'))],
 ['fixed N9 specification',/9\. 生命周期、SEO与治理/.test(spec)],
 ['same launch admin closure',/PC\/Web 前端公开上线与 \/admin 管理必须同闭环完成/.test(spec)]
];
const failed=checks.filter(([,ok])=>!ok);for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);if(failed.length){console.error(`JOBS-R1-N9 FAIL (${failed.length})`);process.exit(1)}console.log('JOBS-R1-N9 PASS');
