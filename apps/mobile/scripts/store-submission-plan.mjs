import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { inspectSubmissionPlan } from './store-submission-plan-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
let expectedSourceCommit;
try {
  expectedSourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: mobileRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
} catch {
  console.error('Could not determine the checked-out Git commit.');
  process.exit(1);
}

const result = inspectSubmissionPlan({ mobileRoot, env: process.env, expectedSourceCommit });

if (!result.valid) {
  console.error(`Store submission runbook failed (${result.failures.length}):`);
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (result.complete) {
  console.log('Store submission plan: COMPLETE');
  process.exit(0);
}

console.log(`Store submission next stage: ${result.nextStage.title} [${result.nextStage.id}]`);
result.nextStage.missing.forEach(({ label, environmentVariable }) => console.log(`- ${label} [confirm with ${environmentVariable}]`));
result.nextStage.commands.forEach((command) => console.log(`  command: ${command}`));
