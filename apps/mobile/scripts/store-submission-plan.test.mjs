import assert from 'node:assert/strict';
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

test('runbook is valid, ordered and begins with release access', () => {
  const result = inspectSubmissionPlan({ mobileRoot, env: {} });
  assert.equal(result.valid, true, result.failures.join('\n'));
  assert.equal(result.complete, false);
  assert.equal(result.nextStage.id, 'release-preflight');
  assert.equal(result.nextStage.missing.length, 7);
});

test('plan advances only after both platform confirmations at each stage', () => {
  let result = inspectSubmissionPlan({ mobileRoot, env: releaseAccess });
  assert.equal(result.nextStage.id, 'production-builds');
  assert.equal(result.nextStage.missing.length, 2);

  const builds = { ...releaseAccess, TRRB_IOS_PRODUCTION_BUILD_CONFIRMED: '1', TRRB_ANDROID_PRODUCTION_BUILD_CONFIRMED: '1' };
  result = inspectSubmissionPlan({ mobileRoot, env: builds });
  assert.equal(result.nextStage.id, 'internal-distribution');

  const distribution = { ...builds, TRRB_TESTFLIGHT_BUILD_CONFIRMED: '1', TRRB_PLAY_INTERNAL_BUILD_CONFIRMED: '1' };
  result = inspectSubmissionPlan({ mobileRoot, env: distribution });
  assert.equal(result.nextStage.id, 'real-device-acceptance');

  const devices = { ...distribution, TRRB_IOS_DEVICE_ACCEPTANCE_CONFIRMED: '1', TRRB_ANDROID_DEVICE_ACCEPTANCE_CONFIRMED: '1' };
  result = inspectSubmissionPlan({ mobileRoot, env: devices });
  assert.equal(result.nextStage.id, 'store-review-submission');

  const submitted = { ...devices, TRRB_APPLE_REVIEW_SUBMITTED: '1', TRRB_GOOGLE_REVIEW_SUBMITTED: '1' };
  result = inspectSubmissionPlan({ mobileRoot, env: submitted });
  assert.equal(result.complete, true);
  assert.equal(result.nextStage, null);
});

test('build and upload commands are explicit while public review submission remains manual', () => {
  const result = inspectSubmissionPlan({ mobileRoot, env: releaseAccess });
  const stages = Object.fromEntries(result.stages.map((stage) => [stage.id, stage]));
  assert.deepEqual(stages['production-builds'].commands, [
    'eas build --platform ios --profile production',
    'eas build --platform android --profile production'
  ]);
  assert.deepEqual(stages['internal-distribution'].commands, [
    'eas submit --platform ios --profile production',
    'eas submit --platform android --profile production'
  ]);
  assert.deepEqual(stages['store-review-submission'].commands, []);
});
