import fs from 'node:fs';
import path from 'node:path';
import { inspectDeviceAcceptance } from './store-device-acceptance-core.mjs';

const ROOT_KEYS = ['schemaVersion', 'sourceCommit', 'appVersion', 'submissions'];
const SUBMISSION_KEYS = [
  'platform', 'easBuildId', 'target', 'nativeBuildVersion',
  'status', 'automaticPublicRelease', 'submittedAt'
];

function hasOnlyKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key));
}

function validIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

export function inspectReviewSubmission({ mobileRoot, evidence, deviceEvidence, distributionEvidence, buildEvidence, expectedSourceCommit }) {
  const deviceResult = inspectDeviceAcceptance({
    mobileRoot, evidence: deviceEvidence, distributionEvidence, buildEvidence, expectedSourceCommit
  });
  const failures = [...deviceResult.failures];
  const expect = (condition, message) => { if (!condition) failures.push(message); };

  expect(hasOnlyKeys(evidence, ROOT_KEYS), 'Review submission evidence contains unsupported root fields');
  expect(evidence?.schemaVersion === 1, 'Review submission evidence schemaVersion must be 1');
  expect(evidence?.sourceCommit === deviceEvidence?.sourceCommit, 'Review submission release commit does not match device acceptance');
  expect(evidence?.appVersion === deviceEvidence?.appVersion, 'Review submission app version does not match device acceptance');

  const submissions = Array.isArray(evidence?.submissions) ? evidence.submissions : [];
  expect(submissions.length === 2, 'Review submission evidence must contain exactly one iOS and one Android record');
  expect(new Set(submissions.map((item) => item?.platform)).size === submissions.length, 'Review submission evidence contains duplicate platforms');
  const byPlatform = Object.fromEntries(submissions.map((item) => [item?.platform, item]));
  const runs = Object.fromEntries((deviceEvidence?.acceptanceRuns ?? []).map((item) => [item?.platform, item]));

  for (const platform of ['ios', 'android']) {
    const submission = byPlatform[platform];
    const run = runs[platform];
    expect(Boolean(submission), `Review submission evidence is missing the ${platform} record`);
    if (!submission) continue;
    expect(hasOnlyKeys(submission, SUBMISSION_KEYS), `${platform} review submission contains unsupported or sensitive fields`);
    expect(submission.easBuildId === run?.easBuildId, `${platform} review submission references a different EAS build`);
    expect(submission.nativeBuildVersion === run?.nativeBuildVersion, `${platform} review submission native build version does not match`);
    expect(submission.target === (platform === 'ios' ? 'app-store-review' : 'google-play-production-review'), `${platform} review submission has the wrong target`);
    expect(submission.status === 'submitted-for-review', `${platform} version must be submitted for review`);
    expect(submission.automaticPublicRelease === false, `${platform} automatic public release must remain disabled`);
    expect(validIsoDate(submission.submittedAt), `${platform} submittedAt must be an ISO timestamp`);
    if (validIsoDate(submission.submittedAt) && validIsoDate(run?.completedAt)) {
      expect(Date.parse(submission.submittedAt) >= Date.parse(run.completedAt), `${platform} was submitted before physical-device acceptance completed`);
    }
  }

  return { valid: failures.length === 0, failures };
}

export function readReviewSubmission({ mobileRoot, evidencePath, deviceEvidencePath, distributionEvidencePath, buildEvidencePath, expectedSourceCommit }) {
  try {
    const resolve = (filePath) => path.isAbsolute(filePath) ? filePath : path.resolve(mobileRoot, filePath);
    const evidence = JSON.parse(fs.readFileSync(resolve(evidencePath), 'utf8'));
    const deviceEvidence = JSON.parse(fs.readFileSync(resolve(deviceEvidencePath), 'utf8'));
    const distributionEvidence = JSON.parse(fs.readFileSync(resolve(distributionEvidencePath), 'utf8'));
    const buildEvidence = JSON.parse(fs.readFileSync(resolve(buildEvidencePath), 'utf8'));
    return inspectReviewSubmission({ mobileRoot, evidence, deviceEvidence, distributionEvidence, buildEvidence, expectedSourceCommit });
  } catch {
    return { valid: false, failures: ['Unable to read or parse the local review submission evidence files'] };
  }
}
