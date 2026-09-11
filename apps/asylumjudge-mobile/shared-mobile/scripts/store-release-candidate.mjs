import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readReleaseCandidate } from './store-release-candidate-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const candidatePath = process.argv[2] ?? 'store/release-candidate.local.json';
const screenshotEvidencePath = process.argv[3] ?? 'store/screenshot-evidence.local.json';
let expectedSourceCommit;

try {
  expectedSourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: mobileRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
} catch {
  console.error('Could not determine the checked-out Git commit.');
  process.exit(1);
}

const result = readReleaseCandidate({
  mobileRoot, candidatePath, screenshotEvidencePath, expectedSourceCommit, verifyFiles: true
});
if (!result.valid) {
  console.error('Store release candidate is not ready:');
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Release candidate ${expectedSourceCommit.slice(0, 12)} is frozen with its 15 verified screenshots.`);
console.log('App version, runtime, production profile, production channel and screenshot evidence digest all match.');
