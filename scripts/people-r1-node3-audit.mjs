import fs from 'node:fs';

const migration = 'supabase/migrations/20260817020000_people_r1_n3_search.sql';
if (!fs.existsSync(migration)) throw new Error(`missing required file: ${migration}`);
const sql = fs.readFileSync(migration, 'utf8');

const assertions = [
  ['published-only search', sql.includes("p.publication_status = 'published'")],
  ['permanent ID returned', sql.includes('person_id uuid') && sql.includes('c.id')],
  ['duplicate names allowed', sql.includes('Duplicate names are intentionally allowed')],
  ['name search', sql.includes('primary_name_normalized') && sql.includes('pg_trgm')],
  ['alias search', sql.includes('people_aliases') && sql.includes('alias_normalized')],
  ['state filter', sql.includes('state_filter') && sql.includes('people_us_regions')],
  ['city filter', sql.includes('city_filter')],
  ['occupation filter', sql.includes('occupation_filter') && sql.includes('people_occupations')],
  ['life status filter', sql.includes('life_status_filter')],
  ['coarse disambiguators', sql.includes('birth_year') && sql.includes('death_year') && sql.includes('us_arrival_year') && sql.includes('states text[]') && sql.includes('cities text[]') && sql.includes('occupations text[]')],
  ['verification exposed', sql.includes('verification_status text')],
  ['bounded pagination', sql.includes('least(coalesce(result_limit, 30), 100)') && sql.includes('result_offset')],
  ['no sensitive identifiers', !/ssn|a-number|alien_number|bank|passport|document_number/i.test(sql)],
];

let failed = 0;
for (const [name, ok] of assertions) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed += 1;
}
if (failed) {
  console.error(`PEOPLE-R1-N3 FAIL: ${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('PEOPLE-R1-N3 PASS');
