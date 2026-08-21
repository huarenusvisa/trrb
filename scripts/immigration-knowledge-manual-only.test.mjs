import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflows = [
  '.github/workflows/immigration-knowledge-daily.yml',
  '.github/workflows/immigration-knowledge-audit.yml'
];

const sources = workflows.map(path => ({ path, source: fs.readFileSync(path, 'utf8') }));

for (const { path, source } of sources) {
  assert.doesNotMatch(source, /^\s{2}(?:push|schedule):/m, `${path} must not auto-trigger writes`);
  assert.match(source, /^\s{2}workflow_dispatch:\s*$/m, `${path} must retain a manual entry point`);
  assert.match(source, /^\s{6}confirm:\s*$/m, `${path} must require a confirmation input`);
  assert.match(source, /inputs\.confirm == 'PUBLISH'/, `${path} must guard execution with PUBLISH`);
  assert.match(source, /^\s{2}group: trrb-immigration-knowledge-publisher\s*$/m, `${path} must share one writer lock`);
}

assert.match(sources[0].source, /node scripts\/immigration-knowledge-daily\.mjs/, 'daily manual recovery entry must remain');
assert.match(sources[1].source, /node scripts\/immigration-knowledge-repair-small\.mjs/, 'audit manual recovery entry must remain');
assert.match(sources[1].source, /needs\.repair\.result == 'success'/, 'audit report must not run after a skipped or failed repair');

console.log('Immigration knowledge automatic publication freeze: PASS');
