import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readDistributionEvidence } from './store-distribution-evidence-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const evidencePath = process.argv[2] ?? 'store/distribution-evidence.local.json';
const buildEvidencePath = process.argv[3] ?? 'store/build-evidence.local.json';
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

const result = readDistributionEvidence({ mobileRoot, evidencePath, buildEvidencePath, expectedSourceCommit });
if (!result.valid) {
  console.error('Internal distribution evidence is not ready:');
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Internal distribution evidence verified for release commit ${expectedSourceCommit.slice(0, 12)}.`);
console.log('The exact iOS IPA is available in TestFlight and the exact Android AAB is an internal-track draft.');
