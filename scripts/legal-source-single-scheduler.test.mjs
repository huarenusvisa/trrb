import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const retired = [
  '.github/workflows/round15-node1-supreme-court.yml',
  '.github/workflows/round15-node2-circuit-opinions.yml',
  '.github/workflows/round15-node3-bia-precedent.yml',
  '.github/workflows/round15-node4-whitehouse-executive-orders.yml',
  '.github/workflows/round15-node5-federal-register-final-rules.yml'
];

for (const file of retired) {
  const workflow = readFileSync(file, 'utf8');
  assert.doesNotMatch(workflow, /^\s*schedule:\s*$/m, `${file} must not retain a schedule`);
  assert.doesNotMatch(workflow, /^\s*push:\s*$/m, `${file} must not run after code pushes`);
  assert.match(workflow, /workflow_dispatch:/, `${file} must retain a manual recovery path`);
  assert.match(workflow, /inputs\.confirmation == 'RUN'/, `${file} must require explicit RUN confirmation`);
}

const unified = readFileSync('.github/workflows/round16-node1-legal-source-sync.yml', 'utf8');
assert.match(unified, /^\s*schedule:\s*$/m, 'Round16 must remain the sole scheduled five-source collector');
for (const expected of [
  'supreme-court-latest.json',
  'circuit-opinions-latest.json',
  'bia-precedent-latest.json',
  'whitehouse-executive-orders-latest.json',
  'federal-register-final-rules-latest.json'
]) {
  assert.match(unified, new RegExp(expected.replaceAll('.', '\\.')), `Round16 must retain ${expected}`);
}

console.log('Round16 is the only scheduled writer for all five official legal-source datasets');
