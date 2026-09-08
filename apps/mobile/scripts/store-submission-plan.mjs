import path from 'node:path';
import process from 'node:process';
import { inspectSubmissionPlan } from './store-submission-plan-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const result = inspectSubmissionPlan({ mobileRoot, env: process.env });

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
