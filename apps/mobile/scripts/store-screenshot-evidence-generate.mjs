import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createScreenshotEvidence, resolveScreenshotEvidenceOutput } from './store-screenshot-evidence-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const positional = args.filter((arg) => arg !== '--force');

if (positional.length > 1 || args.some((arg) => arg.startsWith('--') && arg !== '--force')) {
  console.error('Usage: npm run store:screenshot-evidence-generate -- [store/*.local.json] [--force]');
  process.exit(1);
}

const output = resolveScreenshotEvidenceOutput({ mobileRoot, output: positional[0] });
const outputPath = output.absolutePath;
const relativeOutput = output.relativePath;
if (!output.valid) {
  console.error('Screenshot evidence output must be a *.local.json file inside apps/mobile/store/.');
  process.exit(1);
}
if (fs.existsSync(outputPath) && !force) {
  console.error(`Refusing to overwrite ${relativeOutput}; pass --force after reviewing the existing local evidence.`);
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
  console.error('Commit tracked App changes before generating version-bound screenshot evidence.');
  process.exit(1);
}

const result = createScreenshotEvidence({ mobileRoot, sourceCommit });
if (!result.valid) {
  console.error('Cannot generate screenshot evidence:');
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

const temporaryPath = `${outputPath}.tmp-${process.pid}`;
try {
  fs.writeFileSync(temporaryPath, `${JSON.stringify(result.evidence, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporaryPath, outputPath);
} finally {
  fs.rmSync(temporaryPath, { force: true });
}

console.log(`Generated ${relativeOutput} for release commit ${sourceCommit.slice(0, 12)}.`);
console.log('Recorded dimensions and SHA-256 digests for all 15 local screenshots; no image or credential data was embedded.');
