import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20260817007000_jobs_r1_node7_contact_loop.sql');
const contact=read('jobs/contact.js');
const admin=read('admin/jobs-manager.js');
const spec=read('docs/JOBS-01-US-RECRUITING-AND-JOB-SEEKING.md');
const checks=[
 ['conversation bound to listing',/job_conversations[\s\S]*listing_id uuid not null references public\.job_listings/.test(migration)],
 ['unified account participants',/employer_user_id uuid not null references public\.profiles/.test(migration)&&/seeker_user_id uuid not null references public\.profiles/.test(migration)],
 ['messages canonical table',/create table if not exists public\.job_messages/.test(migration)],
 ['contact events for N8',/create table if not exists public\.job_contact_events/.test(migration)&&/phone','sms','email/.test(migration)],
 ['participant/admin RLS',/public\.is_jobs_admin\(\)/.test(migration)&&/auth\.uid\(\) in \(employer_user_id,seeker_user_id\)/.test(migration)],
 ['web platform messaging',/job_conversations/.test(contact)&&/job_messages/.test(contact)&&/站内联系/.test(contact)],
 ['phone sms email shortcuts',/tel:/.test(contact)&&/sms:/.test(contact)&&/mailto:/.test(contact)],
 ['contactEvent recording',/job_contact_events/.test(contact)&&/record\(m\)/.test(contact)],
 ['admin same-source visibility',/job_conversations/.test(admin)&&/job_contact_events/.test(admin)],
 ['admin governance',/data-jobs-conversation-status/.test(admin)&&/blocked/.test(admin)&&/closed/.test(admin)],
 ['spec fixed N7',/7\. 联系闭环/.test(spec)],
];
const failed=checks.filter(([,ok])=>!ok);for(const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`);if(failed.length){console.error(`JOBS-R1-N7 FAIL (${failed.length})`);process.exit(1);}console.log('JOBS-R1-N7 PASS');