import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readScreenshotEvidence } from './store-screenshot-evidence-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const evidencePath = process.argv[2] ?? 'store/screenshot-evidence.local.json';
let expectedSourceCommit;

try {
  expectedSourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: mobileRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
} catch {
  console.error('Could not determine the checked-out Git commit.');
  process.exit(1);
}

const result = readScreenshotEvidence({ mobileRoot, evidencePath, expectedSourceCommit, verifyFiles: true });
if (!result.valid) {
  console.error('Store screenshot evidence is not ready:');
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`All 15 store screenshots verified for release commit ${expectedSourceCommit.slice(0, 12)}.`);
console.log('iPhone, iPad and Android phone files match the recorded version, locale, dimensions and SHA-256 digests.');
