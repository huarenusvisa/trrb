import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readReviewSubmission } from './store-review-submission-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const evidencePath = process.argv[2] ?? 'store/review-submission.local.json';
const deviceEvidencePath = process.argv[3] ?? 'store/device-acceptance.local.json';
const distributionEvidencePath = process.argv[4] ?? 'store/distribution-evidence.local.json';
const buildEvidencePath = process.argv[5] ?? 'store/build-evidence.local.json';
let expectedSourceCommit;

try {
  expectedSourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: mobileRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
} catch {
  console.error('Could not determine the checked-out Git commit.');
  process.exit(1);
}

const result = readReviewSubmission({
  mobileRoot, evidencePath, deviceEvidencePath, distributionEvidencePath, buildEvidencePath, expectedSourceCommit
});
if (!result.valid) {
  console.error('Store review submission evidence is not ready:');
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Store review submissions verified for release commit ${expectedSourceCommit.slice(0, 12)}.`);
console.log('Both reviewed versions match the physical-device-tested builds and automatic public release remains disabled.');
