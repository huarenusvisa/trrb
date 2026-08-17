import fs from 'node:fs';import {spawnSync} from 'node:child_process';
// Full gate intentionally re-runs every predecessor audit against current main.
const read=p=>fs.readFileSync(p,'utf8');
for(let n=1;n<=9;n++){const p=`scripts/audit-jobs-r1-node${n}.mjs`;if(!fs.existsSync(p)){console.error(`JOBS-R1-N10 FAIL missing ${p}`);process.exit(1)}const r=spawnSync(process.execPath,[p],{stdio:'inherit'});if(r.status!==0){console.error(`JOBS-R1-N10 FAIL predecessor N${n}`);process.exit(r.status||1)}}
const spec=read('docs/JOBS-01-US-RECRUITING-AND-JOB-SEEKING.md');const n1=read('supabase/migrations/20260817001000_jobs_r1_node1_foundation.sql');const n2=read('supabase/migrations/20260817002000_jobs_r1_node2_home_admin_migration.sql');const n8=read('supabase/migrations/20260817008000_jobs_r1_node8_reviews_reports.sql');const n9=read('supabase/migrations/20260817009000_jobs_r1_node9_lifecycle_seo_governance.sql');const mobile=read('apps/mobile/app/jobs.tsx');const feed=read('netlify/functions/public-jobs.js');const webSearch=read('jobs/search.js');const webPublish=read('jobs/publish.js');const admin=read('admin/jobs-manager.js')+read('admin/jobs-lifecycle.js');const listing=read('jobs/listing.html')+read('jobs/listing.js');
const checks=[
 ['fixed 10-node spec',/1\. 美国招聘\/求职数据模型/.test(spec)&&/10\. Web \+ APP \+ 移动端 \+ SEO \+ 安全 \+ 性能生产总验收/.test(spec)],
 ['US-only canonical database',/country_code text not null default 'US' check \(country_code='US'\)/.test(n1)],
 ['unified account roles',/references public\.profiles/.test(n1)&&/active_job_role/.test(n1)],
 ['web canonical search',/search_job_listings/.test(webSearch)],
 ['web canonical publishing',/job_listings/.test(webPublish)],
 ['mobile canonical public feed',/public-jobs/.test(mobile)&&/source:'job_listings'/.test(feed)],
 ['admin same canonical source',/job_listings/.test(admin)&&/job_seeker_posts/.test(admin)&&/job_lifecycle_events/.test(admin)],
 ['same-launch admin rule preserved',/PC\/Web 前端公开上线与 \/admin 管理必须同闭环完成/.test(spec)&&/jobs admin govern listings/.test(n2)],
 ['review report anti-fraud retained',/job_reviews/.test(n8)&&/job_reports/.test(n8)&&/job_risk_labels/.test(n8)&&/on delete restrict/.test(n8)],
 ['stable SEO history URL',/meta name="robots" content="index,follow"/.test(listing)&&/永久记录ID/.test(listing)],
 ['ended records excluded current search',/job_listings_current/.test(n9)&&/status='open'/.test(n9)&&/moderation_hold=false/.test(n9)],
 ['security RLS',/enable row level security/.test(n1)&&/enable row level security/.test(n8)&&/enable row level security/.test(n9)],
 ['performance bounded pages and cache',/pageSize = 30/.test(webSearch)&&/max-age=60/.test(feed)&&/limit:String\(limit\)/.test(feed)],
 ['mobile retry refresh surface',/onRefresh=\{load\}/.test(mobile)&&/重试/.test(mobile)],
 ['N10 status running before close',/JOBS-R1-N10：RUNNING/.test(spec)]
];
const failed=checks.filter(([,ok])=>!ok);for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);if(failed.length){console.error(`JOBS-R1-N10 FAIL (${failed.length})`);process.exit(1)}console.log('JOBS-R1: 10/10 PASS');
