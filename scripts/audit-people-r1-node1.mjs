import fs from 'node:fs';

const file = 'supabase/migrations/20260817001500_people_r1_foundation.sql';
const sql = fs.readFileSync(file, 'utf8');
const failures = [];
const must = (condition, message) => { if (!condition) failures.push(message); };
const has = (pattern) => pattern.test(sql);

must(has(/create table if not exists public\.people\s*\(/i), 'missing people table');
must(has(/id uuid primary key default gen_random_uuid\(\)/i), 'people permanent UUID is missing');
must(has(/people_keep_permanent_id/i) && has(/people_permanent_id_guard/i), 'immutable people.id guard is missing');
must(has(/primary_name text not null/i) && has(/primary_name_normalized text not null/i), 'primary name fields are incomplete');
must(has(/life_status text not null default 'unknown'.*'living'.*'deceased'.*'unknown'/i), 'life_status enum/default is incorrect');
must(has(/creator_type text not null check \(creator_type in \('self','family_friend','netizen','editorial'\)\)/i), 'creator_type contract is missing');
must(has(/verification_status text not null default 'unverified'.*'partially_verified'.*'verified'.*'self_verified'.*'family_verified'/i), 'verification status contract is missing');
must(has(/creator_type[\s\S]{0,800}verification_status/i), 'creation source and verification status are not independently stored');

for (const table of ['people_aliases','people_us_regions','people_occupations','people_achievements','people_timeline','people_sources']) {
  must(sql.includes(`create table if not exists public.${table}`), `missing ${table}`);
  must(new RegExp(`public\\.${table}[^;]+person_id uuid not null references public\\.people\\(id\\) on delete cascade`, 'is').test(sql), `${table} does not bind to permanent person id`);
}

must(has(/us_arrival_date date/i) && has(/us_arrival_story text/i), 'US arrival fields are incomplete');
must(has(/source_type text not null/i) && has(/fact_scope text\[\]/i) && has(/review_status text not null/i), 'source evidence fields are incomplete');
must(has(/record_version integer not null default 1/i), 'record version foundation is missing');

const tableBodies = [...sql.matchAll(/create table if not exists public\.[a-z0-9_]+\s*\(([\s\S]*?)\n\);/gi)].map(m => m[1]).join('\n').toLowerCase();
const forbiddenColumns = ['ssn','social_security','a_number','alien_number','passport_number','bank_account','routing_number','credit_card','verification_code','otp','home_address','street_address'];
for (const name of forbiddenColumns) {
  must(!new RegExp(`(^|\\n)\\s*${name}\\s+`, 'i').test(tableBodies), `forbidden sensitive column present: ${name}`);
}

must(!/extract\s*\(\s*year\s+from\s+age/i.test(sql), 'age-based life/death inference detected');
must(!/life_status\s*=\s*'deceased'/i.test(sql), 'automatic deceased-state assignment detected');

for (const table of ['people','people_aliases','people_us_regions','people_occupations','people_achievements','people_timeline','people_sources']) {
  must(new RegExp(`alter table public\\.${table} enable row level security`, 'i').test(sql), `RLS missing for ${table}`);
}
must(has(/people_public_read[\s\S]*publication_status = 'published'/i), 'public person read policy is not restricted to published records');
must(!/create policy[\s\S]{0,120}\bfor insert\b/i.test(sql), 'public/authenticated write policy was opened in foundation unexpectedly');

if (failures.length) {
  console.error('PEOPLE-R1-N1: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PEOPLE-R1-N1: PASS');
console.log('Verified: permanent ID, independent creator/verification states, life-status non-inference, aliases/US regions/occupations/achievements/timeline/sources, RLS, sensitive-field exclusion.');
