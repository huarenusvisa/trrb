import fs from 'node:fs';

const migrationPath = 'supabase/migrations/20260817001000_jobs_r1_node1_foundation.sql';
const specPath = 'docs/JOBS-01-US-RECRUITING-AND-JOB-SEEKING.md';
const sql = fs.readFileSync(migrationPath, 'utf8');
const spec = fs.readFileSync(specPath, 'utf8');

const checks = [
  ['spec node 1 exists', /1\. 美国招聘\/求职数据模型、统一账号多角色、岗位\/求职生命周期与稳定永久ID。/.test(spec)],
  ['reuses profiles/auth identity', /references public\.profiles\(id\)/.test(sql) && /alter table public\.profiles/.test(sql)],
  ['separate product roles', /create table if not exists public\.job_user_roles/.test(sql)],
  ['both employer and seeker roles', /'employer','job_seeker'/.test(sql)],
  ['active role is non-verification UI context', /not a verification or moderation privilege/i.test(sql)],
  ['job listings permanent UUID id', /create table if not exists public\.job_listings[\s\S]*?id uuid primary key default gen_random_uuid\(\)/.test(sql)],
  ['job seeker permanent UUID id', /create table if not exists public\.job_seeker_posts[\s\S]*?id uuid primary key default gen_random_uuid\(\)/.test(sql)],
  ['US-only jobs constraint', /country_code text not null default 'US' check \(country_code='US'\)/.test(sql)],
  ['US-only seeker constraint', (sql.match(/country_code text not null default 'US' check \(country_code='US'\)/g) || []).length >= 2],
  ['job lifecycle complete', /'draft','open','filled','paused','unlisted','deleted'/.test(sql)],
  ['seeker lifecycle complete', /'draft','seeking','found','paused','unlisted','deleted'/.test(sql)],
  ['normalized location hierarchy', /state_code[\s\S]*?city[\s\S]*?county[\s\S]*?borough[\s\S]*?neighborhood/.test(sql)],
  ['lat lng are paired and constrained', /latitude numeric\(9,6\)/.test(sql) && /longitude numeric\(9,6\)/.test(sql) && /\(latitude is null\) = \(longitude is null\)/.test(sql)],
  ['initial 16 categories', (sql.match(/\('[a-z0-9-]+','[^']+',\d+\)/g) || []).length >= 16],
  ['RLS enabled for role table', /alter table public\.job_user_roles enable row level security/.test(sql)],
  ['RLS enabled for jobs', /alter table public\.job_listings enable row level security/.test(sql)],
  ['RLS enabled for seeker posts', /alter table public\.job_seeker_posts enable row level security/.test(sql)],
  ['owner job writes require employer role', /role='employer'/.test(sql)],
  ['owner seeker writes require seeker role', /role='job_seeker'/.test(sql)],
  ['filled jobs remain public history', /status in \('open','filled'\)/.test(sql)],
  ['inactive seeker records are not public', /status='seeking' or auth\.uid\(\)=seeker_user_id/.test(sql)],
  ['deleted state requires deleted_at', (sql.match(/status <> 'deleted' or deleted_at is not null/g) || []).length >= 2],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
if (failed.length) {
  console.error(`JOBS-R1-N1 FAIL: ${failed.length}/${checks.length} checks failed`);
  process.exit(1);
}
console.log(`JOBS-R1-N1 PASS: ${checks.length}/${checks.length} checks passed`);
