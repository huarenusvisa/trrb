import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createReleaseCandidate, resolveReleaseCandidateOutput } from './store-release-candidate-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const positional = args.filter((arg) => arg !== '--force');
if (positional.length > 2 || args.some((arg) => arg.startsWith('--') && arg !== '--force')) {
  console.error('Usage: npm run store:release-candidate-freeze -- [candidate.local.json] [screenshot-evidence.local.json] [--force]');
  process.exit(1);
}

const output = resolveReleaseCandidateOutput({ mobileRoot, output: positional[0] });
const screenshotEvidencePath = positional[1] ?? 'store/screenshot-evidence.local.json';
if (!output.valid) {
  console.error('Release candidate output must be a *.local.json file inside apps/mobile/store/.');
  process.exit(1);
}
if (fs.existsSync(output.absolutePath) && !force) {
  console.error(`Refusing to overwrite ${output.relativePath}; pass --force only after reviewing the existing freeze.`);
  process.exit(1);
}

let sourceCommit;
try {
  sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: mobileRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
  const trackedChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: mobileRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
  if (trackedChanges) throw new Error('tracked changes');
} catch {
  console.error('Commit tracked App changes before freezing a release candidate.');
  process.exit(1);
}

const result = createReleaseCandidate({ mobileRoot, screenshotEvidencePath, sourceCommit });
if (!result.valid) {
  console.error('Cannot freeze the store release candidate:');
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

const temporaryPath = `${output.absolutePath}.tmp-${process.pid}`;
try {
  fs.writeFileSync(temporaryPath, `${JSON.stringify(result.candidate, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporaryPath, output.absolutePath);
} finally {
  fs.rmSync(temporaryPath, { force: true });
}
console.log(`Frozen ${output.relativePath} for release commit ${sourceCommit.slice(0, 12)}.`);
console.log('The candidate is bound to the verified screenshot evidence without storing images, URLs or credentials.');
