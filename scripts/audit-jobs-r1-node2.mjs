import fs from 'node:fs';

const read = (path) => fs.existsSync(path) ? fs.readFileSync(path,'utf8') : '';
const fail = (message) => { console.error(`JOBS-R1-N2 FAIL: ${message}`); process.exit(1); };
const requireText = (text, pattern, message) => { if (!pattern.test(text)) fail(message); };

const spec = read('docs/JOBS-01-US-RECRUITING-AND-JOB-SEEKING.md');
const index = read('index.html');
const jobsHome = read('jobs-home.js');
const jobsLanding = read('jobs/index.html');
const adminIndex = read('admin/index.html');
const adminManager = read('admin/jobs-manager.js');
const migration = read('supabase/migrations/20260817002000_jobs_r1_node2_home_admin_migration.sql');

requireText(spec,/JOBS-R1-N1：PASS/, 'N1 must remain PASS before N2');
requireText(spec,/PC\/Web 前端公开上线与 \/admin 管理必须同闭环完成/, 'public/admin same-launch hard rule missing');
requireText(index,/jobs-home\.js/, 'homepage does not load JOBS-R1 N2 replacement');
requireText(index,/>招聘求职<\/a>/, 'homepage navigation does not expose recruiting/jobs');
if (index.includes('<a href="/asylum">庇护百科</a>')) fail('legacy asylum nav is still occupying the public navigation position');
requireText(jobsHome,/我要招聘/, 'employer entry missing from former asylum card replacement');
requireText(jobsHome,/我要求职/, 'job-seeker entry missing from former asylum card replacement');
requireText(jobsHome,/querySelector\('#asylum'\)/, 'replacement is not anchored to the former asylum encyclopedia card');
requireText(jobsLanding,/仅限美国境内/, 'US-only scope is not explicit on jobs landing');
requireText(jobsLanding,/统一账号体系/, 'unified account contract missing on jobs landing');

requireText(migration,/where category_name = '庇护百科'/, 'legacy asylum content migration missing');
requireText(migration,/set category_name = '移民美国'/, 'legacy asylum content is not returned to Immigration America');
requireText(migration,/immigration_path/, 'type-aware immigration routing marker missing');
requireText(migration,/job_listings/, 'admin governance does not target formal job_listings table');
requireText(migration,/job_seeker_posts/, 'admin governance does not target formal job_seeker_posts table');
requireText(migration,/admin_users/, 'admin governance is not tied to the unified existing admin identity');

requireText(adminIndex,/data-page="jobs-admin"/, 'unified /admin lacks recruiting/jobs navigation');
requireText(adminIndex,/id="jobs-listings-body"/, 'admin cannot render recruiting data');
requireText(adminIndex,/id="jobs-seekers-body"/, 'admin cannot render job-seeker data');
requireText(adminIndex,/jobs-manager\.js/, 'admin jobs manager is not loaded');
requireText(adminManager,/from\('job_listings'\)/, 'admin does not read formal job_listings');
requireText(adminManager,/from\('job_seeker_posts'\)/, 'admin does not read formal job_seeker_posts');
requireText(adminManager,/employer_user_id/, 'admin cannot identify recruiting publisher');
requireText(adminManager,/seeker_user_id/, 'admin cannot identify job-seeker publisher');
requireText(adminManager,/\.update\(\{status/, 'admin lacks lifecycle governance operation');

console.log('JOBS-R1-N2 PASS: former asylum homepage area replaced by US recruiting/job-seeking dual entry; legacy content is preserved and type-routed into Immigration America; public/admin launch closure uses the same formal JOBS-R1 data and unified admin identity.');
