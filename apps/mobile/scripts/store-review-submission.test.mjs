import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { REQUIRED_ACCEPTANCE_CASES } from './store-device-acceptance-core.mjs';
import { inspectReviewSubmission } from './store-review-submission-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const appVersion = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo.version;
const sourceCommit = '1234567890abcdef1234567890abcdef12345678';

function fixtures() {
  const buildEvidence = {
    schemaVersion: 1, sourceCommit, releaseCandidateSha256: 'a'.repeat(64),
    application: {
      slug: 'trrb', projectId: 'cc29573d-d20c-4c3b-a7d6-1bc74838127a', version: appVersion, runtimeVersion: appVersion,
      ios: { bundleIdentifier: 'com.tangrenribao.iosapp' }, android: { package: 'net.trrb.mobile' }
    },
    builds: ['ios', 'android'].map((platform, index) => ({
      platform, easBuildId: index ? '22222222-2222-4222-8222-222222222222' : '11111111-1111-4111-8111-111111111111',
      profile: 'production', status: 'finished', distribution: 'store', channel: 'production', artifactType: platform === 'ios' ? 'ipa' : 'aab',
      sourceCommit, appVersion, runtimeVersion: appVersion, nativeBuildVersion: '3',
      createdAt: '2026-09-08T00:00:00.000Z', completedAt: '2026-09-08T00:10:00.000Z'
    }))
  };
  const distributionEvidence = {
    schemaVersion: 1, sourceCommit, appVersion,
    distributions: buildEvidence.builds.map((build) => ({
      platform: build.platform, easBuildId: build.easBuildId,
      destination: build.platform === 'ios' ? 'testflight' : 'google-play-internal', status: 'available',
      ...(build.platform === 'android' ? { releaseStatus: 'draft' } : {}), nativeBuildVersion: '3',
      submittedAt: '2026-09-08T00:15:00.000Z', availableAt: '2026-09-08T00:25:00.000Z'
    }))
  };
  const deviceEvidence = {
    schemaVersion: 1, sourceCommit, appVersion,
    acceptanceRuns: distributionEvidence.distributions.map((distribution) => ({
      platform: distribution.platform, easBuildId: distribution.easBuildId, destination: distribution.destination,
      nativeBuildVersion: '3', device: { kind: 'physical', os: distribution.platform, osVersion: '18.6', model: distribution.platform === 'ios' ? 'iPhone 16' : 'Pixel 9' },
      startedAt: '2026-09-08T00:30:00.000Z', completedAt: '2026-09-08T00:45:00.000Z',
      cases: REQUIRED_ACCEPTANCE_CASES.map((id) => ({ id, status: 'passed' })), testContentCleanedUp: true
    }))
  };
  const evidence = {
    schemaVersion: 1, sourceCommit, appVersion,
    submissions: deviceEvidence.acceptanceRuns.map((run) => ({
      platform: run.platform, easBuildId: run.easBuildId,
      target: run.platform === 'ios' ? 'app-store-review' : 'google-play-production-review',
      nativeBuildVersion: run.nativeBuildVersion, status: 'submitted-for-review', automaticPublicRelease: false,
      submittedAt: '2026-09-08T01:00:00.000Z'
    }))
  };
  return { evidence, deviceEvidence, distributionEvidence, buildEvidence };
}

test('accepts manual review submissions tied to the exact device-tested builds', () => {
  const result = inspectReviewSubmission({ mobileRoot, ...fixtures(), expectedSourceCommit: sourceCommit });
  assert.equal(result.valid, true, result.failures.join('\n'));
});

test('rejects another build, native version, app version or release commit', () => {
  const values = fixtures();
  values.evidence.sourceCommit = 'a'.repeat(40);
  values.evidence.appVersion = '0.1.0';
  values.evidence.submissions[0].easBuildId = '33333333-3333-4333-8333-333333333333';
  values.evidence.submissions[1].nativeBuildVersion = '4';
  const result = inspectReviewSubmission({ mobileRoot, ...values, expectedSourceCommit: sourceCommit });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /release commit/);
  assert.match(result.failures.join('\n'), /app version/);
  assert.match(result.failures.join('\n'), /different EAS build/);
  assert.match(result.failures.join('\n'), /native build version/);
});

test('rejects unsafe targets, incomplete submission and automatic public release', () => {
  const values = fixtures();
  values.evidence.submissions[0].target = 'testflight';
  values.evidence.submissions[0].status = 'draft';
  values.evidence.submissions[1].automaticPublicRelease = true;
  const result = inspectReviewSubmission({ mobileRoot, ...values });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /wrong target/);
  assert.match(result.failures.join('\n'), /submitted for review/);
  assert.match(result.failures.join('\n'), /automatic public release/);
});

test('rejects credentials, URLs and submission before device acceptance', () => {
  const values = fixtures();
  values.evidence.credentials = { token: 'secret' };
  values.evidence.submissions[0].reviewUrl = 'https://example.invalid/review?token=secret';
  values.evidence.submissions[1].submittedAt = '2026-09-08T00:40:00.000Z';
  const result = inspectReviewSubmission({ mobileRoot, ...values });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /unsupported root fields/);
  assert.match(result.failures.join('\n'), /sensitive fields/);
  assert.match(result.failures.join('\n'), /before physical-device acceptance/);
});
