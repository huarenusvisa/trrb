import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { inspectDistributionEvidence } from './store-distribution-evidence-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const appVersion = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo.version;
const sourceCommit = '1234567890abcdef1234567890abcdef12345678';

function fixtures() {
  const buildEvidence = {
    schemaVersion: 1,
    sourceCommit,
    releaseCandidateSha256: 'a'.repeat(64),
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
  };
  const evidence = {
    schemaVersion: 1,
    sourceCommit,
    appVersion,
    distributions: buildEvidence.builds.map((build) => ({
      platform: build.platform,
      easBuildId: build.easBuildId,
      destination: build.platform === 'ios' ? 'testflight' : 'google-play-internal',
      status: 'available',
      ...(build.platform === 'android' ? { releaseStatus: 'draft' } : {}),
      nativeBuildVersion: build.nativeBuildVersion,
      submittedAt: '2026-09-08T00:15:00.000Z',
      availableAt: '2026-09-08T00:25:00.000Z'
    }))
  };
  return { evidence, buildEvidence };
}

test('accepts TestFlight and Play internal evidence tied to the exact builds', () => {
  const result = inspectDistributionEvidence({ mobileRoot, ...fixtures(), expectedSourceCommit: sourceCommit });
  assert.equal(result.valid, true, result.failures.join('\n'));
});

test('rejects another build, version or release commit', () => {
  const values = fixtures();
  values.evidence.sourceCommit = 'a'.repeat(40);
  values.evidence.appVersion = '0.1.0';
  values.evidence.distributions[0].easBuildId = '33333333-3333-4333-8333-333333333333';
  const result = inspectDistributionEvidence({ mobileRoot, ...values, expectedSourceCommit: sourceCommit });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /release commit/);
  assert.match(result.failures.join('\n'), /app version/);
  assert.match(result.failures.join('\n'), /different EAS build/);
});

test('rejects public Android release, wrong destination and unfinished processing', () => {
  const values = fixtures();
  values.evidence.distributions[0].status = 'processing';
  values.evidence.distributions[1].destination = 'google-play-production';
  values.evidence.distributions[1].releaseStatus = 'completed';
  const result = inspectDistributionEvidence({ mobileRoot, ...values });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /processed and available/);
  assert.match(result.failures.join('\n'), /wrong internal destination/);
  assert.match(result.failures.join('\n'), /unsafe release status/);
});

test('rejects credentials, URLs and impossible distribution timestamps', () => {
  const values = fixtures();
  values.evidence.credentials = { token: 'secret' };
  values.evidence.distributions[0].storeUrl = 'https://example.invalid/build?token=secret';
  values.evidence.distributions[1].submittedAt = '2026-09-07T23:00:00.000Z';
  const result = inspectDistributionEvidence({ mobileRoot, ...values });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /unsupported root fields/);
  assert.match(result.failures.join('\n'), /sensitive fields/);
  assert.match(result.failures.join('\n'), /before its production build completed/);
});
