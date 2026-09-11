import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readBuildEvidence } from './store-build-evidence-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const evidencePath = process.argv[2] ?? 'store/build-evidence.local.json';
const releaseCandidatePath = process.argv[3] ?? 'store/release-candidate.local.json';
const screenshotEvidencePath = process.argv[4] ?? 'store/screenshot-evidence.local.json';
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

const result = readBuildEvidence({
  mobileRoot, evidencePath, expectedSourceCommit, releaseCandidatePath, screenshotEvidencePath
});
if (!result.valid) {
  console.error('Production build evidence is not ready:');
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Production build evidence verified for release commit ${expectedSourceCommit.slice(0, 12)}.`);
console.log('Both signed store builds match the frozen candidate, current app version, runtime, identifiers and production channel.');
