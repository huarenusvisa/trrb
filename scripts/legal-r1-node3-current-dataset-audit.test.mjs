#!/usr/bin/env node

import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/legal-r1-node3-fulltext-translation.yml', 'utf8');
const checks = [
  ['audit derives the current eligible record ids', workflow.includes('const eligibleIds = new Set(eligible.map(record => String(record.id)))')],
  ['audit validates only files bound to current eligible records', workflow.includes('for (const record of eligible)') && workflow.includes('const name = \`${record.id}.json\`')],
  ['current record and filename must agree', workflow.includes('record/file binding mismatch')],
  ['current translations still require the active dataset version', workflow.includes('if (x.datasetVersion !== db.datasetVersion) throw new Error(\`stale dataset binding: ${name}\`)')],
  ['obsolete files are retained and reported', workflow.includes('obsoleteFiles') && workflow.includes('obsoleteRetained:obsoleteFiles.length')],
  ['audit no longer validates every historical file as current', !workflow.includes('for (const name of files)')]
];

let failures = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${label}`);
  if (!pass) failures += 1;
}
if (failures) process.exit(1);
