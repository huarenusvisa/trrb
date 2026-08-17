import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const spec = read('docs/JOBS-01-US-RECRUITING-AND-JOB-SEEKING.md');
const sql = read('supabase/migrations/20260817003000_jobs_r1_node3_search.sql');
const page = read('jobs/search.html');
const js = read('jobs/search.js');
const landing = read('jobs/index.html');
const admin = read('admin/jobs-manager.js');
const n2sql = read('supabase/migrations/20260817002000_jobs_r1_node2_home_admin_migration.sql');

must(spec.includes('3. 求职搜索：全美国→州→城市→County/Borough→Neighborhood'), 'fixed N3 name/order missing');
must(sql.includes("j.country_code='US'") && sql.includes("j.status='open'"), 'search RPC must be US-only and current-open only');
must(sql.includes('security invoker'), 'search RPC must preserve RLS');
must(sql.includes('job_listings'), 'search RPC must use canonical job_listings');
for (const token of ['p_keyword','p_category_slug','p_employment_type','p_state_code','p_city','p_county','p_borough','p_neighborhood','p_salary_min']) {
  must(sql.includes(token), `search RPC missing ${token}`);
}
for (const sort of ["p_sort='distance'","p_sort='latest'","p_sort='salary'","p_sort='relevance'"]) {
  must(sql.includes(sort), `search RPC missing ${sort}`);
}
must(page.includes('County') && page.includes('Borough') && page.includes('Neighborhood'), 'public search hierarchy incomplete');
must(page.includes('全职') && page.includes('兼职') && page.includes('最低薪资'), 'public employment/salary filters incomplete');
must(page.includes('综合') && page.includes('最新') && page.includes('距离'), 'public sort options incomplete');
must(js.includes("client.rpc('search_job_listings'"), 'public UI must call canonical search RPC');
must(js.includes('navigator.geolocation') && js.includes('未获得定位授权，可继续手动选择州、城市或社区'), 'distance sort must be optional and manual location must remain usable');
must(landing.includes('/jobs/search.html'), 'jobs landing must expose search entry');

// Public/admin launch closure: the same canonical tables must already be visible and governable in unified /admin.
must(admin.includes("from('job_listings')") && admin.includes("from('job_seeker_posts')"), 'unified admin must read canonical jobs data');
must(admin.includes('.update({status,updated_at:'), 'unified admin must govern lifecycle status');
must(n2sql.includes('jobs admin read listings') && n2sql.includes('jobs admin govern listings'), 'admin RLS governance policies missing');
must(!sql.match(/create table\s+public\.(job_search|jobs_search|job_listings_shadow)/i), 'shadow jobs/search data source prohibited');

console.log('JOBS-R1-N3 PASS');
