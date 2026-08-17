import fs from 'node:fs';

const mustRead = (p) => {
  if (!fs.existsSync(p)) throw new Error(`missing ${p}`);
  return fs.readFileSync(p,'utf8');
};
const assert = (cond,msg) => { if (!cond) throw new Error(msg); };

const spec = mustRead('docs/JOBS-01-US-RECRUITING-AND-JOB-SEEKING.md');
const migration = mustRead('supabase/migrations/20260817005000_jobs_r1_node5_publish.sql');
const publishHtml = mustRead('jobs/publish.html');
const publishJs = mustRead('jobs/publish.js');
const jobsIndex = mustRead('jobs/index.html');
const admin = mustRead('admin/jobs-manager.js');
const adminHtml = mustRead('admin/index.html');

assert(spec.includes('5. 极简招聘发布'), 'fixed N5 spec missing');
assert(spec.includes('PC/Web 前端公开上线与 /admin 管理必须同闭环完成'), 'front/admin same-release hard rule missing');
assert(jobsIndex.includes('/jobs/publish.html'), 'employer entry does not reach publish flow');
assert(publishHtml.includes('职位名称') && publishHtml.includes('工作介绍') && publishHtml.includes('主要联系方式'), 'minimal publish required fields missing');
assert(publishHtml.includes('工作环境图片（可选）'), 'optional workplace image missing');
assert(publishJs.includes("from('job_listings').insert"), 'publish flow not using formal job_listings');
assert(publishJs.includes("from('job_user_roles').upsert"), 'unified account employer role not used');
assert(publishJs.includes("country_code: 'US'"), 'US-only publish guard missing');
assert(publishJs.includes("client.storage.from('job-images').upload"), 'optional image upload missing');
assert(publishJs.includes('createImageBitmap') && publishJs.includes("canvas.toBlob"), 'browser re-encoding/EXIF stripping path missing');
assert(migration.includes('contact_method') && migration.includes('contact_public'), 'listing contact schema missing');
assert(migration.includes('job_listing_images'), 'formal listing image table missing');
assert(migration.includes("job-images"), 'formal storage bucket missing');
assert(migration.includes('public.is_jobs_admin()'), 'admin authorization bridge missing');
assert(migration.includes('job listings admin read') && migration.includes('job listings admin govern'), 'admin same-table read/govern RLS missing');
assert(adminHtml.includes('招聘求职管理'), 'admin navigation/management surface missing');
assert(admin.includes("from('job_listings').select"), 'admin is not reading formal job_listings');
assert(admin.includes("from(table).update"), 'admin governance action missing');
assert(!/create\s+table\s+(if\s+not\s+exists\s+)?public\.job_listings_admin\b/i.test(migration), 'shadow admin listing table detected');
assert(!/create\s+table\s+(if\s+not\s+exists\s+)?public\.job_listings_shadow\b/i.test(migration), 'shadow listing table detected');

console.log('JOBS-R1-N5 PASS');
