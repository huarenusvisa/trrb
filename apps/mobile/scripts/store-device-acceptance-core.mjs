import fs from 'node:fs';
import path from 'node:path';
import { inspectDistributionEvidence } from './store-distribution-evidence-core.mjs';

export const REQUIRED_ACCEPTANCE_CASES = [
  'guest-news-browsing',
  'unified-account-sign-in-and-sign-out',
  'community-post-comment-and-cleanup',
  'news-comment-reply-and-cleanup',
  'favorites-and-history-cloud-sync',
  'push-registration-delivery-and-deep-link',
  'account-deletion-entry-and-final-warning'
];

const ROOT_KEYS = ['schemaVersion', 'sourceCommit', 'appVersion', 'acceptanceRuns'];
const RUN_KEYS = ['platform', 'easBuildId', 'destination', 'nativeBuildVersion', 'device', 'startedAt', 'completedAt', 'cases', 'testContentCleanedUp'];
const DEVICE_KEYS = ['kind', 'os', 'osVersion', 'model'];
const CASE_KEYS = ['id', 'status'];

function hasOnlyKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key));
}

function validIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function safeLabel(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 80
    && !/https?:\/\/|token|secret|password|credential|@/i.test(value);
}

export function inspectDeviceAcceptance({ mobileRoot, evidence, distributionEvidence, buildEvidence, expectedSourceCommit }) {
  const distributionResult = inspectDistributionEvidence({
    mobileRoot, evidence: distributionEvidence, buildEvidence, expectedSourceCommit
  });
  const failures = [...distributionResult.failures];
  const expect = (condition, message) => { if (!condition) failures.push(message); };

  expect(hasOnlyKeys(evidence, ROOT_KEYS), 'Device acceptance evidence contains unsupported root fields');
  expect(evidence?.schemaVersion === 1, 'Device acceptance evidence schemaVersion must be 1');
  expect(evidence?.sourceCommit === distributionEvidence?.sourceCommit, 'Device acceptance release commit does not match distribution evidence');
  expect(evidence?.appVersion === distributionEvidence?.appVersion, 'Device acceptance app version does not match distribution evidence');

  const runs = Array.isArray(evidence?.acceptanceRuns) ? evidence.acceptanceRuns : [];
  expect(runs.length === 2, 'Device acceptance must contain exactly one iOS and one Android run');
  expect(new Set(runs.map((run) => run?.platform)).size === runs.length, 'Device acceptance contains duplicate platforms');
  const byPlatform = Object.fromEntries(runs.map((run) => [run?.platform, run]));
  const distributions = Object.fromEntries((distributionEvidence?.distributions ?? []).map((item) => [item?.platform, item]));

  for (const platform of ['ios', 'android']) {
    const run = byPlatform[platform];
    const distribution = distributions[platform];
    expect(Boolean(run), `Device acceptance is missing the ${platform} run`);
    if (!run) continue;
    expect(hasOnlyKeys(run, RUN_KEYS), `${platform} acceptance contains unsupported or sensitive fields`);
    expect(run.easBuildId === distribution?.easBuildId, `${platform} acceptance references a different EAS build`);
    expect(run.nativeBuildVersion === distribution?.nativeBuildVersion, `${platform} acceptance native build version does not match`);
    expect(run.destination === distribution?.destination, `${platform} acceptance references the wrong distribution destination`);
    expect(hasOnlyKeys(run.device, DEVICE_KEYS), `${platform} device contains unsupported or sensitive fields`);
    expect(run.device?.kind === 'physical', `${platform} acceptance must run on a physical device`);
    expect(run.device?.os === platform, `${platform} acceptance device OS does not match`);
    expect(safeLabel(run.device?.osVersion), `${platform} device OS version is missing or unsafe`);
    expect(safeLabel(run.device?.model), `${platform} device model is missing or unsafe`);
    expect(validIsoDate(run.startedAt), `${platform} startedAt must be an ISO timestamp`);
    expect(validIsoDate(run.completedAt), `${platform} completedAt must be an ISO timestamp`);
    if (validIsoDate(run.startedAt) && validIsoDate(run.completedAt)) {
      expect(Date.parse(run.completedAt) >= Date.parse(run.startedAt), `${platform} acceptance completed before it started`);
    }
    if (validIsoDate(run.startedAt) && validIsoDate(distribution?.availableAt)) {
      expect(Date.parse(run.startedAt) >= Date.parse(distribution.availableAt), `${platform} acceptance started before the internal build was available`);
    }

    const cases = Array.isArray(run.cases) ? run.cases : [];
    expect(cases.every((item) => hasOnlyKeys(item, CASE_KEYS)), `${platform} acceptance cases contain unsupported fields`);
    expect(JSON.stringify(cases.map(({ id }) => id)) === JSON.stringify(REQUIRED_ACCEPTANCE_CASES), `${platform} acceptance cases are incomplete or out of order`);
    expect(new Set(cases.map(({ id }) => id)).size === cases.length, `${platform} acceptance cases contain duplicates`);
    expect(cases.every(({ status }) => status === 'passed'), `${platform} acceptance contains a case that did not pass`);
    expect(run.testContentCleanedUp === true, `${platform} marked test content must be cleaned up after acceptance`);
  }

  return { valid: failures.length === 0, failures };
}

export function readDeviceAcceptance({ mobileRoot, evidencePath, distributionEvidencePath, buildEvidencePath, expectedSourceCommit }) {
  try {
    const resolve = (filePath) => path.isAbsolute(filePath) ? filePath : path.resolve(mobileRoot, filePath);
    const evidence = JSON.parse(fs.readFileSync(resolve(evidencePath), 'utf8'));
    const distributionEvidence = JSON.parse(fs.readFileSync(resolve(distributionEvidencePath), 'utf8'));
    const buildEvidence = JSON.parse(fs.readFileSync(resolve(buildEvidencePath), 'utf8'));
    return inspectDeviceAcceptance({ mobileRoot, evidence, distributionEvidence, buildEvidence, expectedSourceCommit });
  } catch {
    return { valid: false, failures: ['Unable to read or parse the local device acceptance evidence files'] };
  }
}
