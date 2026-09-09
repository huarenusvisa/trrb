import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { inspectDeviceAcceptance, REQUIRED_ACCEPTANCE_CASES } from './store-device-acceptance-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const appVersion = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo.version;
const sourceCommit = '1234567890abcdef1234567890abcdef12345678';

function fixtures() {
  const buildEvidence = {
    schemaVersion: 1, sourceCommit, releaseCandidateSha256: 'a'.repeat(64),
    application: {
      slug: 'trrb', projectId: 'cc29573d-d20c-4c3b-a7d6-1bc74838127a', version: appVersion, runtimeVersion: appVersion,
      ios: { bundleIdentifier: 'net.trrb.mobile' }, android: { package: 'net.trrb.mobile' }
    },
    builds: ['ios', 'android'].map((platform, index) => ({
      platform, easBuildId: index ? '22222222-2222-4222-8222-222222222222' : '11111111-1111-4111-8111-111111111111',
      profile: 'production', status: 'finished', distribution: 'store', channel: 'production',
      artifactType: platform === 'ios' ? 'ipa' : 'aab', sourceCommit, appVersion, runtimeVersion: appVersion,
      nativeBuildVersion: '3', createdAt: '2026-09-08T00:00:00.000Z', completedAt: '2026-09-08T00:10:00.000Z'
    }))
  };
  const distributionEvidence = {
    schemaVersion: 1, sourceCommit, appVersion,
    distributions: buildEvidence.builds.map((build) => ({
      platform: build.platform, easBuildId: build.easBuildId,
      destination: build.platform === 'ios' ? 'testflight' : 'google-play-internal', status: 'available',
      ...(build.platform === 'android' ? { releaseStatus: 'draft' } : {}),
      nativeBuildVersion: '3', submittedAt: '2026-09-08T00:15:00.000Z', availableAt: '2026-09-08T00:25:00.000Z'
    }))
  };
  const evidence = {
    schemaVersion: 1, sourceCommit, appVersion,
    acceptanceRuns: distributionEvidence.distributions.map((distribution) => ({
      platform: distribution.platform, easBuildId: distribution.easBuildId, destination: distribution.destination,
      nativeBuildVersion: distribution.nativeBuildVersion,
      device: { kind: 'physical', os: distribution.platform, osVersion: '18.6', model: distribution.platform === 'ios' ? 'iPhone 16' : 'Pixel 9' },
      startedAt: '2026-09-08T00:30:00.000Z', completedAt: '2026-09-08T00:45:00.000Z',
      cases: REQUIRED_ACCEPTANCE_CASES.map((id) => ({ id, status: 'passed' })), testContentCleanedUp: true
    }))
  };
  return { evidence, distributionEvidence, buildEvidence };
}

test('accepts complete physical-device runs tied to the exact internal builds', () => {
  const result = inspectDeviceAcceptance({ mobileRoot, ...fixtures(), expectedSourceCommit: sourceCommit });
  assert.equal(result.valid, true, result.failures.join('\n'));
});

test('rejects another build, native version, app version or release commit', () => {
  const values = fixtures();
  values.evidence.sourceCommit = 'a'.repeat(40);
  values.evidence.appVersion = '0.1.0';
  values.evidence.acceptanceRuns[0].easBuildId = '33333333-3333-4333-8333-333333333333';
  values.evidence.acceptanceRuns[1].nativeBuildVersion = '4';
  const result = inspectDeviceAcceptance({ mobileRoot, ...values, expectedSourceCommit: sourceCommit });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /release commit/);
  assert.match(result.failures.join('\n'), /app version/);
  assert.match(result.failures.join('\n'), /different EAS build/);
  assert.match(result.failures.join('\n'), /native build version/);
});

test('rejects simulator runs, wrong OS, missing cases and failed cases', () => {
  const values = fixtures();
  values.evidence.acceptanceRuns[0].device.kind = 'simulator';
  values.evidence.acceptanceRuns[0].device.os = 'android';
  values.evidence.acceptanceRuns[1].cases.pop();
  values.evidence.acceptanceRuns[0].cases[0].status = 'failed';
  const result = inspectDeviceAcceptance({ mobileRoot, ...values });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /physical device/);
  assert.match(result.failures.join('\n'), /device OS/);
  assert.match(result.failures.join('\n'), /incomplete or out of order/);
  assert.match(result.failures.join('\n'), /did not pass/);
});

test('rejects uncleared test content, sensitive fields and impossible timestamps', () => {
  const values = fixtures();
  values.evidence.credentials = { password: 'secret' };
  values.evidence.acceptanceRuns[0].testerEmail = 'reviewer@example.com';
  values.evidence.acceptanceRuns[1].device.model = 'https://example.invalid/device';
  values.evidence.acceptanceRuns[0].startedAt = '2026-09-08T00:20:00.000Z';
  values.evidence.acceptanceRuns[1].testContentCleanedUp = false;
  const result = inspectDeviceAcceptance({ mobileRoot, ...values });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /unsupported root fields/);
  assert.match(result.failures.join('\n'), /sensitive fields/);
  assert.match(result.failures.join('\n'), /model is missing or unsafe/);
  assert.match(result.failures.join('\n'), /before the internal build was available/);
  assert.match(result.failures.join('\n'), /must be cleaned up/);
});
