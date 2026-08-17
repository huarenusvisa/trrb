import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20260817008000_jobs_r1_node8_reviews_reports.sql');
const review=read('jobs/review.js');
const reviewHtml=read('jobs/review.html');
const admin=read('admin/jobs-manager.js');
const spec=read('docs/JOBS-01-US-RECRUITING-AND-JOB-SEEKING.md');
const checks=[
 ['reviews canonical table',/create table if not exists public\.job_reviews/.test(migration)],
 ['contact gated review',/contact_event_id uuid not null references public\.job_contact_events/.test(migration)&&/job_contact_events e/.test(migration)],
 ['traceable anonymous',/public_anonymous boolean not null default false/.test(migration)&&/平台账户仍可追溯/.test(reviewHtml)],
 ['multi-dimension scores',/communication_score/.test(migration)&&/accuracy_score/.test(migration)&&/compensation_score/.test(migration)],
 ['reports canonical table',/create table if not exists public\.job_reports/.test(migration)&&/suspected_fraud/.test(migration)],
 ['risk labels canonical table',/create table if not exists public\.job_risk_labels/.test(migration)&&/suspected_fraud/.test(migration)],
 ['public web review submit',/job_reviews/.test(review)&&/job_contact_events/.test(review)&&/upsert\(payload/.test(review)],
 ['public one-click report',/job_reports/.test(review)&&/report-reason/.test(review)],
 ['admin same-source visibility',/job_reviews/.test(admin)&&/job_reports/.test(admin)&&/job_risk_labels/.test(admin)],
 ['admin review governance',/data-jobs-review-status/.test(admin)&&/under_review/.test(admin)&&/hidden/.test(admin)],
 ['admin report governance',/data-jobs-report-status/.test(admin)&&/actioned/.test(admin)&&/dismissed/.test(admin)],
 ['admin risk governance',/data-jobs-risk-status/.test(admin)&&/resolved/.test(admin)],
 ['unified account references',/reviewer_user_id uuid not null references public\.profiles/.test(migration)&&/reporter_user_id uuid not null references public\.profiles/.test(migration)],
 ['spec fixed N8',/8\. 真实联系后的评价与反诈骗/.test(spec)],
 ['same launch closure rule',/PC\/Web 前端公开上线与 \/admin 管理必须同闭环完成/.test(spec)],
];
const failed=checks.filter(([,ok])=>!ok);for(const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`);if(failed.length){console.error(`JOBS-R1-N8 FAIL (${failed.length})`);process.exit(1);}console.log('JOBS-R1-N8 PASS');
