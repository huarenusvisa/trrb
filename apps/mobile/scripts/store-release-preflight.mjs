import path from 'node:path';
import process from 'node:process';
import { inspectReleaseReadiness } from './store-release-preflight-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const strict = process.argv.includes('--strict');
const result = inspectReleaseReadiness({ mobileRoot, env: process.env });

if (!result.codeReady) {
  console.error(`Store release code preflight failed (${result.failures.length}):`);
  for (const failure of result.failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Store release code preflight: PASS (${result.releaseLane})`);
if (result.externalReady) {
  console.log('External store access preflight: PASS');
} else {
  console.log(`External store access pending (${result.missing.length}):`);
  for (const requirement of result.missing) {
    console.log(`- ${requirement.label} [confirm with ${requirement.confirmationEnvironmentVariable}]`);
  }
}

if (strict && !result.externalReady) process.exit(2);
