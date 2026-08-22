import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/reclassify-immigration-articles-once.yml', 'utf8');
const script = readFileSync('scripts/reclassify-immigration-articles.mjs', 'utf8');

assert.doesNotMatch(workflow, /^\s*push:\s*$/m, 'historical reclassification must not run on push');
assert.match(workflow, /workflow_dispatch:/, 'manual dispatch must remain available');
assert.match(workflow, /inputs\.confirmation == 'APPLY'/, 'workflow must require an explicit APPLY confirmation');
assert.match(script, /APPLY_CHANGES \|\| 'false'/, 'database writes must default to dry-run');
assert.match(script, /APPLY_CONFIRMATION \|\| ''\) === 'APPLY'/, 'script must independently verify the APPLY token');

console.log('immigration historical reclassification is manual-only and defaults to dry-run');
