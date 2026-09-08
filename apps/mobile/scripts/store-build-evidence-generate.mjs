import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  createBuildEvidence,
  resolveBuildEvidenceLocalPath
} from './store-build-evidence-generate-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const positional = args.filter((arg) => arg !== '--force');

if (positional.length > 3 || args.some((arg) => arg.startsWith('--') && arg !== '--force')) {
  console.error('Usage: npm run store:build-evidence-generate -- [ios-build.local.json] [android-build.local.json] [build-evidence.local.json] [--force]');
  process.exit(1);
}

const paths = [
  positional[0] ?? 'store/eas-ios-build.local.json',
  positional[1] ?? 'store/eas-android-build.local.json',
  positional[2] ?? 'store/build-evidence.local.json'
].map((filePath) => resolveBuildEvidenceLocalPath({ mobileRoot, filePath }));
if (paths.some(({ valid }) => !valid)) {
  console.error('EAS input and build evidence output must be *.local.json files inside apps/mobile/store/.');
  process.exit(1);
}
const [iosInput, androidInput, output] = paths;
if (fs.existsSync(output.absolutePath) && !force) {
  console.error(`Refusing to overwrite ${output.relativePath}; pass --force after reviewing the existing local evidence.`);
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
  console.error('Commit tracked App changes before generating version-bound build evidence.');
  process.exit(1);
}

let iosBuild;
let androidBuild;
try {
  iosBuild = JSON.parse(fs.readFileSync(iosInput.absolutePath, 'utf8'));
  androidBuild = JSON.parse(fs.readFileSync(androidInput.absolutePath, 'utf8'));
} catch {
  console.error('Could not read the local iOS and Android EAS build JSON files.');
  process.exit(1);
}

const result = createBuildEvidence({ mobileRoot, iosBuild, androidBuild, expectedSourceCommit: sourceCommit });
if (!result.valid) {
  console.error('Cannot generate production build evidence:');
  result.failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

const temporaryPath = `${output.absolutePath}.tmp-${process.pid}`;
try {
  fs.writeFileSync(temporaryPath, `${JSON.stringify(result.evidence, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporaryPath, output.absolutePath);
} finally {
  fs.rmSync(temporaryPath, { force: true });
}

console.log(`Generated ${output.relativePath} for release commit ${sourceCommit.slice(0, 12)}.`);
console.log('Copied only verified build metadata; artifact URLs, logs, actors and credentials were not retained.');
