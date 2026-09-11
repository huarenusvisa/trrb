import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectSubmissionPlan } from './store-submission-plan-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const appVersion = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo.version;
const releaseAccess = {
  TRRB_EXPO_ACCESS_CONFIRMED: '1',
  TRRB_APPLE_ASC_APP_ID: '1234567890',
  TRRB_APPLE_CREDENTIALS_CONFIRMED: '1',
  TRRB_GOOGLE_PLAY_CREDENTIALS_CONFIRMED: '1',
  TRRB_STORE_SCREENSHOTS_CONFIRMED: '1',
  TRRB_STORE_FORMS_CONFIRMED: '1',
  TRRB_REVIEW_ACCOUNT_CONFIRMED: '1'
};

function buildEvidenceFile(t, releaseCandidatePath, sourceCommit = '1234567890abcdef1234567890abcdef12345678') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trrb-build-evidence-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const evidencePath = path.join(directory, 'evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify({
    schemaVersion: 1,
    sourceCommit,
    releaseCandidateSha256: crypto.createHash('sha256').update(fs.readFileSync(releaseCandidatePath)).digest('hex'),
    application: {
      slug: 'trrb', projectId: 'cc29573d-d20c-4c3b-a7d6-1bc74838127a', version: appVersion, runtimeVersion: appVersion,
      ios: { bundleIdentifier: 'com.tangrenribao.iosapp' }, android: { package: 'net.trrb.mobile' }
    },
    builds: ['ios', 'android'].map((platform, index) => ({
      platform,
      easBuildId: index === 0 ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
      profile: 'production', status: 'finished', distribution: 'store', channel: 'production',
      artifactType: platform === 'ios' ? 'ipa' : 'aab', sourceCommit, appVersion, runtimeVersion: appVersion,
      nativeBuildVersion: '3', createdAt: '2026-09-08T00:00:00.000Z', completedAt: '2026-09-08T00:10:00.000Z'
    }))
  }));
  return evidencePath;
}

function screenshotEvidenceFile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trrb-screenshot-evidence-plan-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const evidencePath = path.join(directory, 'evidence.json');
  const screens = ['01-home', '02-america', '03-immigration', '04-legal', '05-community'];
  const configs = [
    ['app-store-iphone69', 'iphone-6.9', 'store/app-store/screenshots/iphone-6.9', 1290, 2796],
    ['app-store-ipad13', 'ipad-13', 'store/app-store/screenshots/ipad-13', 2048, 2732],
    ['google-play-phone', 'android-phone', 'store/google-play/screenshots/phone', 1080, 1920]
  ];
  let digest = 0;
  fs.writeFileSync(evidencePath, JSON.stringify({
    schemaVersion: 1, sourceCommit: '1234567890abcdef1234567890abcdef12345678', appVersion,
    locale: 'zh-CN', capturedAt: '2026-09-08T00:00:00.000Z',
    sets: configs.map(([id, deviceClass, screenshotDirectory, width, height]) => ({
      id, deviceClass, directory: screenshotDirectory,
      screenshots: screens.map((name) => ({ name, width, height, sha256: (++digest).toString(16).padStart(64, '0') }))
    }))
  }));
  return evidencePath;
}

function releaseCandidateFile(t, screenshotEvidencePath) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trrb-release-candidate-plan-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const evidencePath = path.join(directory, 'evidence.json');
  const screenshotEvidenceSha256 = crypto.createHash('sha256').update(fs.readFileSync(screenshotEvidencePath)).digest('hex');
  fs.writeFileSync(evidencePath, JSON.stringify({
    schemaVersion: 1,
    sourceCommit: '1234567890abcdef1234567890abcdef12345678',
    appVersion,
    runtimeVersion: appVersion,
    profile: 'production',
    channel: 'production',
    screenshotEvidenceSha256,
    frozenAt: '2026-09-08T00:05:00.000Z'
  }));
  return evidencePath;
}

function distributionEvidenceFile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trrb-distribution-evidence-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const evidencePath = path.join(directory, 'evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify({
    schemaVersion: 1,
    sourceCommit: '1234567890abcdef1234567890abcdef12345678',
    appVersion,
    distributions: ['ios', 'android'].map((platform, index) => ({
      platform,
      easBuildId: index === 0 ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
      destination: platform === 'ios' ? 'testflight' : 'google-play-internal',
      status: 'available',
      ...(platform === 'android' ? { releaseStatus: 'draft' } : {}),
      nativeBuildVersion: '3',
      submittedAt: '2026-09-08T00:15:00.000Z',
      availableAt: '2026-09-08T00:25:00.000Z'
    }))
  }));
  return evidencePath;
}

function deviceAcceptanceFile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trrb-device-acceptance-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const evidencePath = path.join(directory, 'evidence.json');
  const cases = [
    'guest-news-browsing', 'unified-account-sign-in-and-sign-out',
    'community-post-comment-and-cleanup', 'news-comment-reply-and-cleanup',
    'favorites-and-history-cloud-sync', 'push-registration-delivery-and-deep-link',
    'account-deletion-entry-and-final-warning'
  ];
  fs.writeFileSync(evidencePath, JSON.stringify({
    schemaVersion: 1, sourceCommit: '1234567890abcdef1234567890abcdef12345678', appVersion,
    acceptanceRuns: ['ios', 'android'].map((platform, index) => ({
      platform,
      easBuildId: index === 0 ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
      destination: platform === 'ios' ? 'testflight' : 'google-play-internal', nativeBuildVersion: '3',
      device: { kind: 'physical', os: platform, osVersion: '18.6', model: platform === 'ios' ? 'iPhone 16' : 'Pixel 9' },
      startedAt: '2026-09-08T00:30:00.000Z', completedAt: '2026-09-08T00:45:00.000Z',
      cases: cases.map((id) => ({ id, status: 'passed' })), testContentCleanedUp: true
    }))
  }));
  return evidencePath;
}

function reviewSubmissionFile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trrb-review-submission-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const evidencePath = path.join(directory, 'evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify({
    schemaVersion: 1, sourceCommit: '1234567890abcdef1234567890abcdef12345678', appVersion,
    submissions: ['ios', 'android'].map((platform, index) => ({
      platform,
      easBuildId: index === 0 ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
      target: platform === 'ios' ? 'app-store-review' : 'google-play-production-review', nativeBuildVersion: '3',
      status: 'submitted-for-review', automaticPublicRelease: false, submittedAt: '2026-09-08T01:00:00.000Z'
    }))
  }));
  return evidencePath;
}

test('runbook is valid, ordered and begins with release access', () => {
  const result = inspectSubmissionPlan({ mobileRoot, env: {} });
  assert.equal(result.valid, true, result.failures.join('\n'));
  assert.equal(result.complete, false);
  assert.equal(result.nextStage.id, 'release-preflight');
  assert.equal(result.nextStage.missing.length, 9);
});

test('plan advances only after both platform confirmations and valid paired build evidence', (t) => {
  const sourceCommit = '1234567890abcdef1234567890abcdef12345678';
  const screenshotEvidencePath = screenshotEvidenceFile(t);
  const releaseCandidatePath = releaseCandidateFile(t, screenshotEvidencePath);
  const access = {
    ...releaseAccess,
    TRRB_STORE_SCREENSHOT_EVIDENCE_FILE: screenshotEvidencePath,
    TRRB_STORE_RELEASE_CANDIDATE_FILE: releaseCandidatePath
  };
  let result = inspectSubmissionPlan({ mobileRoot, env: access, expectedSourceCommit: sourceCommit });
  assert.equal(result.nextStage.id, 'production-builds');
  assert.equal(result.nextStage.missing.length, 3);

  const builds = { ...access, TRRB_IOS_PRODUCTION_BUILD_CONFIRMED: '1', TRRB_ANDROID_PRODUCTION_BUILD_CONFIRMED: '1' };
  result = inspectSubmissionPlan({ mobileRoot, env: builds });
  assert.equal(result.nextStage.id, 'production-builds');
  assert.deepEqual(result.nextStage.missing.map(({ id }) => id), ['production-build-evidence']);

  builds.TRRB_STORE_BUILD_EVIDENCE_FILE = buildEvidenceFile(t, releaseCandidatePath, 'a'.repeat(40));
  result = inspectSubmissionPlan({ mobileRoot, env: builds, expectedSourceCommit: sourceCommit });
  assert.equal(result.nextStage.id, 'production-builds');

  builds.TRRB_STORE_BUILD_EVIDENCE_FILE = buildEvidenceFile(t, releaseCandidatePath);
  result = inspectSubmissionPlan({ mobileRoot, env: builds, expectedSourceCommit: sourceCommit });
  assert.equal(result.nextStage.id, 'internal-distribution');
  assert.equal(result.nextStage.missing.length, 3);

  const distribution = { ...builds, TRRB_TESTFLIGHT_BUILD_CONFIRMED: '1', TRRB_PLAY_INTERNAL_BUILD_CONFIRMED: '1' };
  result = inspectSubmissionPlan({ mobileRoot, env: distribution });
  assert.equal(result.nextStage.id, 'internal-distribution');
  assert.deepEqual(result.nextStage.missing.map(({ id }) => id), ['internal-distribution-evidence']);

  distribution.TRRB_STORE_DISTRIBUTION_EVIDENCE_FILE = distributionEvidenceFile(t);
  result = inspectSubmissionPlan({ mobileRoot, env: distribution, expectedSourceCommit: sourceCommit });
  assert.equal(result.nextStage.id, 'real-device-acceptance');
  assert.equal(result.nextStage.missing.length, 3);

  const devices = { ...distribution, TRRB_IOS_DEVICE_ACCEPTANCE_CONFIRMED: '1', TRRB_ANDROID_DEVICE_ACCEPTANCE_CONFIRMED: '1' };
  result = inspectSubmissionPlan({ mobileRoot, env: devices, expectedSourceCommit: sourceCommit });
  assert.equal(result.nextStage.id, 'real-device-acceptance');
  assert.deepEqual(result.nextStage.missing.map(({ id }) => id), ['real-device-acceptance-evidence']);

  devices.TRRB_STORE_DEVICE_ACCEPTANCE_FILE = deviceAcceptanceFile(t);
  result = inspectSubmissionPlan({ mobileRoot, env: devices, expectedSourceCommit: '1234567890abcdef1234567890abcdef12345678' });
  assert.equal(result.nextStage.id, 'store-review-submission');

  const submitted = { ...devices, TRRB_APPLE_REVIEW_SUBMITTED: '1', TRRB_GOOGLE_REVIEW_SUBMITTED: '1' };
  result = inspectSubmissionPlan({ mobileRoot, env: submitted, expectedSourceCommit: sourceCommit });
  assert.equal(result.nextStage.id, 'store-review-submission');
  assert.deepEqual(result.nextStage.missing.map(({ id }) => id), ['store-review-submission-evidence']);

  submitted.TRRB_STORE_REVIEW_SUBMISSION_FILE = reviewSubmissionFile(t);
  result = inspectSubmissionPlan({ mobileRoot, env: submitted, expectedSourceCommit: '1234567890abcdef1234567890abcdef12345678' });
  assert.equal(result.complete, true);
  assert.equal(result.nextStage, null);
});

test('build and upload commands are explicit while public review submission remains manual', () => {
  const result = inspectSubmissionPlan({ mobileRoot, env: releaseAccess });
  const stages = Object.fromEntries(result.stages.map((stage) => [stage.id, stage]));
  assert.deepEqual(stages['release-preflight'].commands, [
    'npm run store:release-preflight:strict',
    'npm run store:screenshot-evidence-check -- store/screenshot-evidence.local.json',
    'npm run store:release-candidate-check -- store/release-candidate.local.json store/screenshot-evidence.local.json'
  ]);
  assert.deepEqual(stages['production-builds'].commands, [
    'eas build --platform ios --profile production',
    'eas build --platform android --profile production',
    'npm run store:build-evidence-generate',
    'npm run store:build-evidence-check -- store/build-evidence.local.json store/release-candidate.local.json store/screenshot-evidence.local.json'
  ]);
  assert.deepEqual(stages['internal-distribution'].commands, [
    'eas submit --platform ios --profile production',
    'eas submit --platform android --profile production',
    'npm run store:distribution-evidence-check -- store/distribution-evidence.local.json store/build-evidence.local.json'
  ]);
  assert.deepEqual(stages['real-device-acceptance'].commands, [
    'npm run store:device-acceptance-check -- store/device-acceptance.local.json store/distribution-evidence.local.json store/build-evidence.local.json'
  ]);
  assert.deepEqual(stages['store-review-submission'].commands, [
    'npm run store:review-submission-check -- store/review-submission.local.json store/device-acceptance.local.json store/distribution-evidence.local.json store/build-evidence.local.json'
  ]);
});
