import fs from 'node:fs';
import path from 'node:path';
import { inspectBuildEvidence } from './store-build-evidence-core.mjs';

const ALLOWED_ROOT_KEYS = ['schemaVersion', 'sourceCommit', 'appVersion', 'distributions'];
const ALLOWED_DISTRIBUTION_KEYS = [
  'platform', 'easBuildId', 'destination', 'status', 'releaseStatus',
  'nativeBuildVersion', 'submittedAt', 'availableAt'
];

function hasOnlyKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key));
}

function validIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

export function inspectDistributionEvidence({ mobileRoot, evidence, buildEvidence, expectedSourceCommit }) {
  const buildResult = inspectBuildEvidence({ mobileRoot, evidence: buildEvidence, expectedSourceCommit });
  const failures = [...buildResult.failures];
  const expect = (condition, message) => { if (!condition) failures.push(message); };

  expect(hasOnlyKeys(evidence, ALLOWED_ROOT_KEYS), 'Distribution evidence contains unsupported root fields');
  expect(evidence?.schemaVersion === 1, 'Distribution evidence schemaVersion must be 1');
  expect(evidence?.sourceCommit === buildEvidence?.sourceCommit, 'Distribution evidence release commit does not match build evidence');
  expect(evidence?.appVersion === buildEvidence?.application?.version, 'Distribution evidence app version does not match build evidence');

  const distributions = Array.isArray(evidence?.distributions) ? evidence.distributions : [];
  expect(distributions.length === 2, 'Distribution evidence must contain exactly one iOS and one Android record');
  expect(new Set(distributions.map((item) => item?.platform)).size === distributions.length, 'Distribution evidence contains duplicate platforms');
  const byPlatform = Object.fromEntries(distributions.map((item) => [item?.platform, item]));
  const builds = Object.fromEntries((buildEvidence?.builds ?? []).map((item) => [item?.platform, item]));

  for (const platform of ['ios', 'android']) {
    const distribution = byPlatform[platform];
    const build = builds[platform];
    expect(Boolean(distribution), `Distribution evidence is missing the ${platform} record`);
    if (!distribution) continue;
    expect(hasOnlyKeys(distribution, ALLOWED_DISTRIBUTION_KEYS), `${platform} distribution contains unsupported or sensitive fields`);
    expect(distribution.easBuildId === build?.easBuildId, `${platform} distribution references a different EAS build`);
    expect(distribution.nativeBuildVersion === build?.nativeBuildVersion, `${platform} distribution native build version does not match`);
    expect(distribution.destination === (platform === 'ios' ? 'testflight' : 'google-play-internal'), `${platform} distribution has the wrong internal destination`);
    expect(distribution.status === 'available', `${platform} internal build must be processed and available`);
    expect(platform === 'android' ? distribution.releaseStatus === 'draft' : distribution.releaseStatus == null, `${platform} distribution has an unsafe release status`);
    expect(validIsoDate(distribution.submittedAt), `${platform} submittedAt must be an ISO timestamp`);
    expect(validIsoDate(distribution.availableAt), `${platform} availableAt must be an ISO timestamp`);
    if (validIsoDate(distribution.submittedAt) && validIsoDate(distribution.availableAt)) {
      expect(Date.parse(distribution.availableAt) >= Date.parse(distribution.submittedAt), `${platform} became available before it was submitted`);
    }
    if (validIsoDate(distribution.submittedAt) && validIsoDate(build?.completedAt)) {
      expect(Date.parse(distribution.submittedAt) >= Date.parse(build.completedAt), `${platform} was submitted before its production build completed`);
    }
  }

  return { valid: failures.length === 0, failures };
}

export function readDistributionEvidence({ mobileRoot, evidencePath, buildEvidencePath, expectedSourceCommit }) {
  try {
    const resolve = (filePath) => path.isAbsolute(filePath) ? filePath : path.resolve(mobileRoot, filePath);
    const evidence = JSON.parse(fs.readFileSync(resolve(evidencePath), 'utf8'));
    const buildEvidence = JSON.parse(fs.readFileSync(resolve(buildEvidencePath), 'utf8'));
    return inspectDistributionEvidence({ mobileRoot, evidence, buildEvidence, expectedSourceCommit });
  } catch {
    return { valid: false, failures: ['Unable to read or parse the local distribution evidence files'] };
  }
}
