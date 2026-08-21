import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(
  new URL('../.github/workflows/legacy-search-recovery.yml', import.meta.url),
  'utf8'
);

assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
assert.doesNotMatch(workflow, /^\s*push:\s*$/m);
assert.doesNotMatch(workflow, /^\s*schedule:\s*$/m);
assert.match(workflow, /confirm_apply:/);
assert.match(workflow, /github\.event\.inputs\.confirm_apply == 'APPLY'/);
assert.match(workflow, /restore-legacy-archive\.mjs --apply/);

console.log('legacy search recovery manual-only guard: PASS');
