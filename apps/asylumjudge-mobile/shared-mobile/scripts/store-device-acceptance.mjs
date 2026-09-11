import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readDeviceAcceptance } from './store-device-acceptance-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const evidencePath = process.argv[2] ?? 'store/device-acceptance.local.json';
const distributionEvidencePath = process.argv[3] ?? 'store/distribution-evidence.local.json';
const buildEvidencePath = process.argv[4] ?? 'store/build-evidence.local.json';
let expectedSourceCommit;

try {
  expectedSourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: mobileRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
} catch {
  console.error('Could not determine the checked-out Git commit.');
  process.exit(1);
}

const result = readDeviceAcceptance({
  mobileRoot, evidencePath, distributionEvidencePath, buildEvidencePath, expectedSourceCommit
});
if (!result.valid) {
  console.error('Real-device acceptance evidence is not ready:');
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Real-device acceptance verified for release commit ${expectedSourceCommit.slice(0, 12)}.`);
console.log('The exact TestFlight and Google Play internal builds passed all required cases on physical devices.');
