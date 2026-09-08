import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectSubmissionPlan } from './store-submission-plan-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const releaseAccess = {
  TRRB_EXPO_ACCESS_CONFIRMED: '1',
  TRRB_APPLE_ASC_APP_ID: '1234567890',
  TRRB_APPLE_CREDENTIALS_CONFIRMED: '1',
  TRRB_GOOGLE_PLAY_CREDENTIALS_CONFIRMED: '1',
  TRRB_STORE_SCREENSHOTS_CONFIRMED: '1',
  TRRB_STORE_FORMS_CONFIRMED: '1',
  TRRB_REVIEW_ACCOUNT_CONFIRMED: '1'
};

function buildEvidenceFile(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trrb-build-evidence-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sourceCommit = '1234567890abcdef1234567890abcdef12345678';
  const evidencePath = path.join(directory, 'evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify({
    schemaVersion: 1,
    sourceCommit,
    application: {
      slug: 'trrb', projectId: 'cc29573d-d20c-4c3b-a7d6-1bc74838127a', version: '0.2.0', runtimeVersion: '0.2.0',
      ios: { bundleIdentifier: 'net.trrb.mobile' }, android: { package: 'net.trrb.mobile' }
    },
    builds: ['ios', 'android'].map((platform, index) => ({
      platform,
      easBuildId: index === 0 ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
      profile: 'production', status: 'finished', distribution: 'store', channel: 'production',
      artifactType: platform === 'ios' ? 'ipa' : 'aab', sourceCommit, appVersion: '0.2.0', runtimeVersion: '0.2.0',
      nativeBuildVersion: '3', createdAt: '2026-09-08T00:00:00.000Z', completedAt: '2026-09-08T00:10:00.000Z'
    }))
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
    appVersion: '0.2.0',
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
    schemaVersion: 1, sourceCommit: '1234567890abcdef1234567890abcdef12345678', appVersion: '0.2.0',
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

test('runbook is valid, ordered and begins with release access', () => {
  const result = inspectSubmissionPlan({ mobileRoot, env: {} });
  assert.equal(result.valid, true, result.failures.join('\n'));
  assert.equal(result.complete, false);
  assert.equal(result.nextStage.id, 'release-preflight');
  assert.equal(result.nextStage.missing.length, 7);
});

test('plan advances only after both platform confirmations and valid paired build evidence', (t) => {
  let result = inspectSubmissionPlan({ mobileRoot, env: releaseAccess });
  assert.equal(result.nextStage.id, 'production-builds');
  assert.equal(result.nextStage.missing.length, 3);

  const builds = { ...releaseAccess, TRRB_IOS_PRODUCTION_BUILD_CONFIRMED: '1', TRRB_ANDROID_PRODUCTION_BUILD_CONFIRMED: '1' };
  result = inspectSubmissionPlan({ mobileRoot, env: builds });
  assert.equal(result.nextStage.id, 'production-builds');
  assert.deepEqual(result.nextStage.missing.map(({ id }) => id), ['production-build-evidence']);

  builds.TRRB_STORE_BUILD_EVIDENCE_FILE = buildEvidenceFile(t);
  result = inspectSubmissionPlan({ mobileRoot, env: builds, expectedSourceCommit: 'a'.repeat(40) });
  assert.equal(result.nextStage.id, 'production-builds');

  result = inspectSubmissionPlan({ mobileRoot, env: builds, expectedSourceCommit: '1234567890abcdef1234567890abcdef12345678' });
  assert.equal(result.nextStage.id, 'internal-distribution');
  assert.equal(result.nextStage.missing.length, 3);

  const distribution = { ...builds, TRRB_TESTFLIGHT_BUILD_CONFIRMED: '1', TRRB_PLAY_INTERNAL_BUILD_CONFIRMED: '1' };
  result = inspectSubmissionPlan({ mobileRoot, env: distribution });
  assert.equal(result.nextStage.id, 'internal-distribution');
  assert.deepEqual(result.nextStage.missing.map(({ id }) => id), ['internal-distribution-evidence']);

  distribution.TRRB_STORE_DISTRIBUTION_EVIDENCE_FILE = distributionEvidenceFile(t);
  result = inspectSubmissionPlan({ mobileRoot, env: distribution, expectedSourceCommit: '1234567890abcdef1234567890abcdef12345678' });
  assert.equal(result.nextStage.id, 'real-device-acceptance');
  assert.equal(result.nextStage.missing.length, 3);

  const devices = { ...distribution, TRRB_IOS_DEVICE_ACCEPTANCE_CONFIRMED: '1', TRRB_ANDROID_DEVICE_ACCEPTANCE_CONFIRMED: '1' };
  result = inspectSubmissionPlan({ mobileRoot, env: devices, expectedSourceCommit: '1234567890abcdef1234567890abcdef12345678' });
  assert.equal(result.nextStage.id, 'real-device-acceptance');
  assert.deepEqual(result.nextStage.missing.map(({ id }) => id), ['real-device-acceptance-evidence']);

  devices.TRRB_STORE_DEVICE_ACCEPTANCE_FILE = deviceAcceptanceFile(t);
  result = inspectSubmissionPlan({ mobileRoot, env: devices, expectedSourceCommit: '1234567890abcdef1234567890abcdef12345678' });
  assert.equal(result.nextStage.id, 'store-review-submission');

  const submitted = { ...devices, TRRB_APPLE_REVIEW_SUBMITTED: '1', TRRB_GOOGLE_REVIEW_SUBMITTED: '1' };
  result = inspectSubmissionPlan({ mobileRoot, env: submitted, expectedSourceCommit: '1234567890abcdef1234567890abcdef12345678' });
  assert.equal(result.complete, true);
  assert.equal(result.nextStage, null);
});

test('build and upload commands are explicit while public review submission remains manual', () => {
  const result = inspectSubmissionPlan({ mobileRoot, env: releaseAccess });
  const stages = Object.fromEntries(result.stages.map((stage) => [stage.id, stage]));
  assert.deepEqual(stages['production-builds'].commands, [
    'eas build --platform ios --profile production',
    'eas build --platform android --profile production',
    'npm run store:build-evidence-check -- store/build-evidence.local.json'
  ]);
  assert.deepEqual(stages['internal-distribution'].commands, [
    'eas submit --platform ios --profile production',
    'eas submit --platform android --profile production',
    'npm run store:distribution-evidence-check -- store/distribution-evidence.local.json store/build-evidence.local.json'
  ]);
  assert.deepEqual(stages['real-device-acceptance'].commands, [
    'npm run store:device-acceptance-check -- store/device-acceptance.local.json store/distribution-evidence.local.json store/build-evidence.local.json'
  ]);
  assert.deepEqual(stages['store-review-submission'].commands, []);
});
