import fs from 'node:fs';

const mustRead = (p) => {
  if (!fs.existsSync(p)) throw new Error(`missing ${p}`);
  return fs.readFileSync(p, 'utf8');
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const spec = mustRead('docs/JOBS-01-US-RECRUITING-AND-JOB-SEEKING.md');
const migration = mustRead('supabase/migrations/20260817006000_jobs_r1_node6_seeker_profile.sql');
const seekerHtml = mustRead('jobs/seeker.html');
const seekerJs = mustRead('jobs/seeker.js');
const jobsIndex = mustRead('jobs/index.html');
const admin = mustRead('admin/jobs-manager.js');
const adminHtml = mustRead('admin/index.html');

assert(spec.includes('6. 求职者档案/求职发布'), 'fixed N6 spec missing');
assert(spec.includes('PC/Web 前端公开上线与 /admin 管理必须同闭环完成'), 'front/admin same-release hard rule missing');
assert(jobsIndex.includes('/jobs/seeker.html'), 'job seeker entry does not reach seeker publish flow');
assert(seekerHtml.includes('头像可选') && seekerHtml.includes('默认头像'), 'optional/default avatar requirement missing');
assert(seekerHtml.includes('经历') && seekerHtml.includes('自我介绍') && seekerHtml.includes('目标岗位'), 'seeker profile fields missing');
assert(seekerHtml.includes('公开电话') && seekerHtml.includes('公开Email'), 'progressive public contact controls missing');
assert(seekerHtml.includes('身份证号') && seekerHtml.includes('SSN') && seekerHtml.includes('银行卡') && seekerHtml.includes('移民文件号码'), 'high-sensitive data warning missing');
assert(seekerJs.includes("from('job_user_roles').upsert") && seekerJs.includes("role:'job_seeker'"), 'unified account job seeker role not used');
assert(seekerJs.includes("from('job_seeker_profiles').upsert"), 'formal seeker profile source not used');
assert(seekerJs.includes("from('job_seeker_posts').insert"), 'formal seeker post source not used');
assert(seekerJs.includes("country_code:'US'"), 'US-only seeker post guard missing');
assert(seekerJs.includes("storage.from('job-profile-images').upload") && seekerJs.includes('createImageBitmap'), 'avatar upload/re-encoding path missing');
assert(migration.includes('create table if not exists public.job_seeker_profiles'), 'formal seeker profile table missing');
assert(migration.includes('user_id uuid primary key references public.profiles(id)'), 'profile not bound to unified account');
assert(migration.includes('phone_public boolean not null default false') && migration.includes('email_public boolean not null default false'), 'contact privacy defaults missing');
assert(migration.includes('job_seeker_profiles_public'), 'public-safe seeker profile view missing');
assert(migration.includes('case when phone_public then phone else null end') && migration.includes('case when email_public then email else null end'), 'non-public contact redaction missing');
assert(migration.includes('public.is_jobs_admin()'), 'admin authorization bridge missing');
assert(adminHtml.includes('招聘求职管理'), 'admin management surface missing');
assert(admin.includes("from('job_seeker_profiles').select"), 'admin cannot inspect formal seeker profiles');
assert(admin.includes("from('job_seeker_posts').select"), 'admin cannot inspect formal seeker posts');
assert(admin.includes("from('job_seeker_profiles').update"), 'admin cannot govern seeker profile public-contact state');
assert(admin.includes("from(table).update"), 'admin cannot govern seeker post lifecycle state');
assert(admin.includes('data-jobs-profile-action="hide_phone"') && admin.includes('data-jobs-profile-action="hide_email"'), 'admin contact privacy governance controls missing');
assert(!/create\s+table\s+(if\s+not\s+exists\s+)?public\.job_seeker_(profiles|posts)_(admin|shadow)\b/i.test(migration), 'shadow seeker admin table detected');

// Dedicated strict acceptance marker for JOBS-R1-N6.
console.log('JOBS-R1-N6 PASS');
