import fs from 'node:fs';

// Read-only compatibility audit. The homepage keeps a four-day freshness rule
// for ordinary news sections while the unified bundle may retain older sparse-
// category supplements so low-volume modules do not disappear.

const home = fs.readFileSync('articles-home.js', 'utf8');
const guard = fs.readFileSync('homepage-refresh-guard.js', 'utf8');

const checks = [
  ['ordinary homepage sections use four-day freshness', home.includes('const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;')],
  ['14-day legacy freshness is absent', !home.includes('const HOME_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;')],
  ['refresh health window remains four days', guard.includes('const HOME_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000;')],
  ['refresh guard preserves sparse supplements', guard.includes('4d-core-plus-category-supplements')]
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
}
console.log(`HOME_FRESHNESS_READ_ONLY_AUDIT=true checks=${checks.length} failures=${failures}`);
if (failures) process.exit(1);
