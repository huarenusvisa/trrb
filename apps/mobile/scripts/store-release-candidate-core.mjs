import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readScreenshotEvidence } from './store-screenshot-evidence-core.mjs';

const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const DIGEST = /^[0-9a-f]{64}$/i;
const ROOT_KEYS = [
  'schemaVersion', 'sourceCommit', 'appVersion', 'runtimeVersion', 'profile', 'channel',
  'screenshotEvidenceSha256', 'frozenAt'
];

function hasOnlyKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key));
}

function validIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveLocalFile(mobileRoot, filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(mobileRoot, filePath);
}

function fileDigest(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function resolveReleaseCandidateOutput({ mobileRoot, output = 'store/release-candidate.local.json' }) {
  const absolutePath = path.resolve(mobileRoot, output);
  const storeRoot = path.join(mobileRoot, 'store');
  const relativePath = path.relative(storeRoot, absolutePath);
  const valid = !relativePath.startsWith('..') && !path.isAbsolute(relativePath) && absolutePath.endsWith('.local.json');
  return { valid, absolutePath, relativePath };
}

export function inspectReleaseCandidate({
  mobileRoot, candidate, screenshotEvidencePath, expectedSourceCommit, verifyFiles = true
}) {
  const failures = [];
  const expect = (condition, message) => { if (!condition) failures.push(message); };
  const app = readJson(path.join(mobileRoot, 'app.json')).expo;
  let screenshotEvidence;
  let screenshotDigest;

  if (screenshotEvidencePath) {
    const screenshotPath = resolveLocalFile(mobileRoot, screenshotEvidencePath);
    try {
      screenshotEvidence = readJson(screenshotPath);
      screenshotDigest = fileDigest(screenshotPath);
    } catch {
      failures.push('Unable to read or hash the local screenshot evidence file');
    }
  } else {
    failures.push('Screenshot evidence path is required');
  }
  const screenshotResult = screenshotEvidencePath
    ? readScreenshotEvidence({ mobileRoot, evidencePath: screenshotEvidencePath, expectedSourceCommit, verifyFiles })
    : { valid: false, failures: [] };
  if (!screenshotResult.valid) failures.push(...screenshotResult.failures);

  expect(hasOnlyKeys(candidate, ROOT_KEYS), 'Release candidate contains unsupported or sensitive fields');
  expect(candidate?.schemaVersion === 1, 'Release candidate schemaVersion must be 1');
  expect(COMMIT_SHA.test(candidate?.sourceCommit ?? ''), 'Release candidate sourceCommit must be a full Git commit SHA');
  if (expectedSourceCommit) expect(candidate?.sourceCommit === expectedSourceCommit, 'Release candidate does not belong to the checked-out Git commit');
  expect(candidate?.sourceCommit === screenshotEvidence?.sourceCommit, 'Release candidate and screenshot evidence use different Git commits');
  expect(candidate?.appVersion === app.version, 'Release candidate app version does not match app.json');
  expect(candidate?.appVersion === screenshotEvidence?.appVersion, 'Release candidate and screenshot evidence use different App versions');
  expect(candidate?.runtimeVersion === app.version, 'Release candidate runtime version must match the app-version policy');
  expect(candidate?.profile === 'production', 'Release candidate profile must be production');
  expect(candidate?.channel === 'production', 'Release candidate channel must be production');
  expect(DIGEST.test(candidate?.screenshotEvidenceSha256 ?? ''), 'Release candidate must include the screenshot evidence SHA-256');
  expect(candidate?.screenshotEvidenceSha256 === screenshotDigest, 'Release candidate screenshot evidence digest does not match the local file');
  expect(validIsoDate(candidate?.frozenAt), 'Release candidate frozenAt must be an ISO timestamp');
  if (validIsoDate(candidate?.frozenAt) && validIsoDate(screenshotEvidence?.capturedAt)) {
    expect(Date.parse(candidate.frozenAt) >= Date.parse(screenshotEvidence.capturedAt), 'Release candidate cannot be frozen before its screenshots were captured');
  }

  return { valid: failures.length === 0, failures };
}

export function createReleaseCandidate({ mobileRoot, screenshotEvidencePath, sourceCommit, frozenAt = new Date().toISOString() }) {
  const screenshotPath = resolveLocalFile(mobileRoot, screenshotEvidencePath);
  let screenshotEvidence;
  let screenshotEvidenceSha256;
  try {
    screenshotEvidence = readJson(screenshotPath);
    screenshotEvidenceSha256 = fileDigest(screenshotPath);
  } catch {
    return { valid: false, failures: ['Unable to read or hash the local screenshot evidence file'], candidate: null };
  }
  const app = readJson(path.join(mobileRoot, 'app.json')).expo;
  const candidate = {
    schemaVersion: 1,
    sourceCommit,
    appVersion: app.version,
    runtimeVersion: app.version,
    profile: 'production',
    channel: 'production',
    screenshotEvidenceSha256,
    frozenAt
  };
  const inspected = inspectReleaseCandidate({
    mobileRoot, candidate, screenshotEvidencePath, expectedSourceCommit: sourceCommit, verifyFiles: true
  });
  if (screenshotEvidence.sourceCommit !== sourceCommit) {
    inspected.failures.push('Screenshot evidence must be regenerated for the current Git commit before freezing');
    inspected.valid = false;
  }
  return { ...inspected, candidate: inspected.valid ? candidate : null };
}

export function readReleaseCandidate({
  mobileRoot, candidatePath, screenshotEvidencePath, expectedSourceCommit, verifyFiles = true
}) {
  try {
    const candidate = readJson(resolveLocalFile(mobileRoot, candidatePath));
    return inspectReleaseCandidate({ mobileRoot, candidate, screenshotEvidencePath, expectedSourceCommit, verifyFiles });
  } catch {
    return { valid: false, failures: ['Unable to read or parse the local release candidate file'] };
  }
}
