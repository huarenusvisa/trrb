import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { inspectBuildEvidence } from './store-build-evidence-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const appVersion = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo.version;
const sourceCommit = '1234567890abcdef1234567890abcdef12345678';
const releaseCandidateSha256 = 'a'.repeat(64);

function validEvidence() {
  return {
    schemaVersion: 1,
    sourceCommit,
    releaseCandidateSha256,
    application: {
      slug: 'trrb',
      projectId: 'cc29573d-d20c-4c3b-a7d6-1bc74838127a',
      version: appVersion,
      runtimeVersion: appVersion,
      ios: { bundleIdentifier: 'com.tangrenribao.iosapp' },
      android: { package: 'net.trrb.mobile' }
    },
    builds: ['ios', 'android'].map((platform, index) => ({
      platform,
      easBuildId: index === 0 ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
      profile: 'production',
      status: 'finished',
      distribution: 'store',
      channel: 'production',
      artifactType: platform === 'ios' ? 'ipa' : 'aab',
      sourceCommit,
      appVersion,
      runtimeVersion: appVersion,
      nativeBuildVersion: '3',
      createdAt: '2026-09-08T00:00:00.000Z',
      completedAt: '2026-09-08T00:10:00.000Z'
    }))
  };
}

test('accepts matching finished iOS IPA and Android AAB evidence bound to the frozen candidate', () => {
  const result = inspectBuildEvidence({
    mobileRoot, evidence: validEvidence(), expectedSourceCommit: sourceCommit,
    expectedReleaseCandidateSha256: releaseCandidateSha256
  });
  assert.equal(result.valid, true, result.failures.join('\n'));
});

test('rejects evidence from another release commit or app version', () => {
  const evidence = validEvidence();
  evidence.application.version = '0.1.0';
  const result = inspectBuildEvidence({ mobileRoot, evidence, expectedSourceCommit: 'a'.repeat(40) });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /checked-out Git commit/);
  assert.match(result.failures.join('\n'), /app version/);
});

test('rejects builds associated with another frozen release candidate', () => {
  const result = inspectBuildEvidence({
    mobileRoot, evidence: validEvidence(), expectedSourceCommit: sourceCommit,
    expectedReleaseCandidateSha256: 'b'.repeat(64)
  });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /verified frozen release candidate/);
});

test('rejects unfinished, duplicated or wrong store artifacts', () => {
  const evidence = validEvidence();
  evidence.builds[1].platform = 'ios';
  evidence.builds[1].status = 'in-progress';
  const result = inspectBuildEvidence({ mobileRoot, evidence });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /duplicate platforms/);
  assert.match(result.failures.join('\n'), /must be finished/);
  assert.match(result.failures.join('\n'), /wrong artifact type/);
});

test('rejects URLs, credentials and any unsupported evidence fields', () => {
  const evidence = validEvidence();
  evidence.builds[0].artifactUrl = 'https://example.invalid/signed.ipa?token=secret';
  evidence.credentials = { password: 'secret' };
  const result = inspectBuildEvidence({ mobileRoot, evidence });
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /unsupported root fields/);
  assert.match(result.failures.join('\n'), /sensitive fields/);
});
