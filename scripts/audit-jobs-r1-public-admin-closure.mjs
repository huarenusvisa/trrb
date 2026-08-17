import fs from 'node:fs';

const read = (path) => fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';

const publicFiles = [
  'index.html',
  'jobs.html',
  'jobs/index.html',
  'jobs.js',
  'jobs-home.js'
];
const adminFiles = [
  'admin/index.html',
  'admin/admin.js',
  'admin/jobs-manager.js',
  'admin/jobs.html'
];

const publicText = publicFiles.map(read).join('\n');
const adminText = adminFiles.map(read).join('\n');

const publicJobsLive = /招聘求职|招聘岗位|求职发布|job[_ -]?listings|job[_ -]?seeker/i.test(publicText);
const adminCanSeeJobs = /招聘求职|招聘管理|job[_ -]?listings|job[_ -]?seeker/i.test(adminText);
const adminHasGovernance = /status|暂停|下架|删除|审核|举报|moderation|update|manage/i.test(adminText);

if (publicJobsLive && (!adminCanSeeJobs || !adminHasGovernance)) {
  console.error('JOBS-R1 ADMIN CLOSURE FAIL: public recruiting/job-seeking UI is present but /admin lacks corresponding data visibility/governance capability.');
  process.exit(1);
}

console.log(`JOBS-R1 ADMIN CLOSURE PASS publicJobsLive=${publicJobsLive} adminCanSeeJobs=${adminCanSeeJobs} adminHasGovernance=${adminHasGovernance}`);
