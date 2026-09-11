import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { inspectBuildEvidence } from './store-build-evidence-core.mjs';
import { readReleaseCandidate } from './store-release-candidate-core.mjs';

const PLATFORM = { IOS: 'ios', ANDROID: 'android' };

function fileDigest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveLocalFile(mobileRoot, filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(mobileRoot, filePath);
}

export function resolveBuildEvidenceLocalPath({
  mobileRoot, filePath = 'store/build-evidence.local.json'
}) {
  const absolutePath = path.resolve(mobileRoot, filePath);
  const storeRoot = path.join(mobileRoot, 'store');
  const relativePath = path.relative(storeRoot, absolutePath);
  const valid = !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
    && absolutePath.endsWith('.local.json');
  return { valid, absolutePath, relativePath: path.join('store', relativePath) };
}

function convertEasBuild(raw, expectedPlatform, failures) {
  const label = expectedPlatform === 'ios' ? 'iOS' : 'Android';
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    failures.push(`${label} EAS build JSON must contain one build object`);
    return null;
  }

  const platform = PLATFORM[String(raw.platform ?? '').toUpperCase()];
  if (platform !== expectedPlatform) failures.push(`${label} EAS build JSON has the wrong platform`);
  if (!raw.app || typeof raw.app !== 'object' || !raw.updateChannel || !raw.runtime) {
    failures.push(`${label} EAS build JSON does not use the supported current EAS CLI app/updateChannel/runtime shape`);
  }

  return {
    platform: expectedPlatform,
    easBuildId: raw.id,
    profile: raw.buildProfile,
    status: String(raw.status ?? '').toLowerCase(),
    distribution: String(raw.distribution ?? '').toLowerCase(),
    channel: raw.updateChannel?.name,
    artifactType: expectedPlatform === 'ios' ? 'ipa' : 'aab',
    sourceCommit: raw.gitCommitHash,
    appVersion: raw.appVersion,
    runtimeVersion: raw.runtime?.version,
    nativeBuildVersion: raw.appBuildVersion,
    createdAt: raw.createdAt,
    completedAt: raw.completedAt
  };
}

export function createBuildEvidence({
  mobileRoot,
  iosBuild,
  androidBuild,
  releaseCandidatePath = 'store/release-candidate.local.json',
  screenshotEvidencePath = 'store/screenshot-evidence.local.json',
  expectedSourceCommit,
  verifyCandidateFiles = true
}) {
  const failures = [];
  let releaseCandidateSha256;
  const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo;
  const candidate = readReleaseCandidate({
    mobileRoot,
    candidatePath: releaseCandidatePath,
    screenshotEvidencePath,
    expectedSourceCommit,
    verifyFiles: verifyCandidateFiles
  });
  if (!candidate.valid) {
    failures.push(...candidate.failures.map((failure) => `Release candidate: ${failure}`));
  } else {
    releaseCandidateSha256 = fileDigest(resolveLocalFile(mobileRoot, releaseCandidatePath));
  }

  const builds = [
    convertEasBuild(iosBuild, 'ios', failures),
    convertEasBuild(androidBuild, 'android', failures)
  ].filter(Boolean);
  const rawBuilds = [iosBuild, androidBuild];
  for (const [index, raw] of rawBuilds.entries()) {
    const label = index === 0 ? 'iOS' : 'Android';
    if (raw?.app?.id !== app.extra?.eas?.projectId) {
      failures.push(`${label} EAS build belongs to a different Expo project`);
    }
  }

  const evidence = {
    schemaVersion: 1,
    sourceCommit: expectedSourceCommit,
    releaseCandidateSha256,
    application: {
      slug: app.slug,
      projectId: app.extra?.eas?.projectId,
      version: app.version,
      runtimeVersion: app.version,
      ios: { bundleIdentifier: app.ios?.bundleIdentifier },
      android: { package: app.android?.package }
    },
    builds
  };
  const inspected = inspectBuildEvidence({
    mobileRoot,
    evidence,
    expectedSourceCommit,
    expectedReleaseCandidateSha256: releaseCandidateSha256
  });
  failures.push(...inspected.failures);

  return { valid: failures.length === 0, failures, evidence: failures.length === 0 ? evidence : null };
}
