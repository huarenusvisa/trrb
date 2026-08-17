import fs from 'node:fs';

const migrationPath = 'supabase/migrations/20260817011000_jobs_r2_node1_search_location.sql';
const specPath = 'docs/JOBS-R2-LOCATION-AWARE-JOB-DISCOVERY-UX.md';
const sql = fs.readFileSync(migrationPath, 'utf8');
const spec = fs.readFileSync(specPath, 'utf8');

const checks = [
  ['spec node 1 exists', /1\. 找工位置模型与账号同步/.test(spec)],
  ['single account-level search location table', /create table if not exists public\.job_search_locations/.test(sql)],
  ['reuses unified profile identity', /user_id uuid primary key references public\.profiles\(id\)/.test(sql)],
  ['all five location modes', /'current_location','fixed_location','zip','region','all_us'/.test(sql)],
  ['device geolocation source exists', /'device_geolocation'/.test(sql)],
  ['zip region map and coarse-ip sources exist', /'manual_zip','manual_region','manual_map','ip_coarse','all_us'/.test(sql)],
  ['coordinates are paired and bounded', /latitude numeric\(9,6\)/.test(sql) && /longitude numeric\(9,6\)/.test(sql) && /\(latitude is null\) = \(longitude is null\)/.test(sql)],
  ['human-readable public label', /public_label text/.test(sql)],
  ['standard location hierarchy retained', /state_code[\s\S]*?city[\s\S]*?county[\s\S]*?borough[\s\S]*?neighborhood/.test(sql)],
  ['metro-area support', /metro_slug text/.test(sql)],
  ['device location requires consent timestamp', /source <> 'device_geolocation' or location_consent_at is not null/.test(sql)],
  ['current location requires device geolocation', /mode <> 'current_location' or source = 'device_geolocation'/.test(sql)],
  ['current location requires coordinates', /mode <> 'current_location' or \(latitude is not null and longitude is not null\)/.test(sql)],
  ['zip mode requires zip source and postal code', /mode <> 'zip' or source = 'manual_zip'/.test(sql) && /mode <> 'zip' or postal_code is not null/.test(sql)],
  ['region mode permits coarse IP fallback', /mode <> 'region' or source in \('manual_region','manual_map','ip_coarse'\)/.test(sql)],
  ['all-US mode never stores coordinates', /mode <> 'all_us' or \(latitude is null and longitude is null\)/.test(sql)],
  ['coarse IP cannot masquerade as GPS', /source <> 'ip_coarse' or \(latitude is null and longitude is null and accuracy_meters is null\)/.test(sql)],
  ['follow-current requires authorized device mode', /not follow_current_location or \(mode = 'current_location' and source = 'device_geolocation'\)/.test(sql)],
  ['owner-only RLS enabled', /alter table public\.job_search_locations enable row level security/.test(sql) && /auth\.uid\(\) = user_id/.test(sql)],
  ['owner read insert update delete policies', (sql.match(/create policy "job search location owner/g) || []).length >= 4],
  ['explicitly not a home-address record', /not a home-address record/i.test(sql)],
  ['no second jobs identity table introduced', !/create table if not exists public\.(job_accounts|job_users|job_profiles)/.test(sql)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
if (failed.length) {
  console.error(`JOBS-R2-N1 FAIL: ${failed.length}/${checks.length} checks failed`);
  process.exit(1);
}
console.log(`JOBS-R2-N1 PASS: ${checks.length}/${checks.length} checks passed`);
