import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createBuildEvidence,
  resolveBuildEvidenceLocalPath
} from './store-build-evidence-generate-core.mjs';

const sourceCommit = '1234567890abcdef1234567890abcdef12345678';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trrb-build-generator-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'store'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: {
    slug: 'trrb', version: '0.2.0', runtimeVersion: { policy: 'appVersion' },
    extra: { eas: { projectId: 'cc29573d-d20c-4c3b-a7d6-1bc74838127a' } },
    ios: { bundleIdentifier: 'net.trrb.mobile', supportsTablet: true },
    android: { package: 'net.trrb.mobile' }
  } }));
  fs.writeFileSync(path.join(root, 'store/submission-assets.json'), JSON.stringify({
    screens: ['01-home', '02-america', '03-immigration', '04-legal', '05-community'],
    appStore: {
      iphone69: { directory: 'store/app-store/screenshots/iphone-6.9', acceptedPortraitSizes: [[1290, 2796]] },
      ipad13: { directory: 'store/app-store/screenshots/ipad-13', acceptedPortraitSizes: [[2048, 2732]] }
    },
    googlePlay: { directory: 'store/google-play/screenshots/phone', minimumDimension: 320, maximumDimension: 3840, maximumAspectRatio: 2 }
  }));
  fs.mkdirSync(path.join(root, 'store/google-play'), { recursive: true });
  fs.writeFileSync(path.join(root, 'store/google-play/listing.json'), JSON.stringify({
    phoneScreenshots: ['01-home', '02-america', '03-immigration', '04-legal', '05-community']
  }));
  const configs = [
    ['app-store-iphone69', 'iphone-6.9', 'store/app-store/screenshots/iphone-6.9', 1290, 2796],
    ['app-store-ipad13', 'ipad-13', 'store/app-store/screenshots/ipad-13', 2048, 2732],
    ['google-play-phone', 'android-phone', 'store/google-play/screenshots/phone', 1080, 1920]
  ];
  let digest = 0;
  const screenshotEvidence = {
    schemaVersion: 1, sourceCommit, appVersion: '0.2.0', locale: 'zh-CN', capturedAt: '2026-09-08T00:00:00.000Z',
    sets: configs.map(([id, deviceClass, directory, width, height]) => ({
      id, deviceClass, directory,
      screenshots: ['01-home', '02-america', '03-immigration', '04-legal', '05-community']
        .map((name) => ({ name, width, height, sha256: (++digest).toString(16).padStart(64, '0') }))
    }))
  };
  const screenshotPath = path.join(root, 'store/screenshot-evidence.local.json');
  fs.writeFileSync(screenshotPath, JSON.stringify(screenshotEvidence));
  const candidatePath = path.join(root, 'store/release-candidate.local.json');
  fs.writeFileSync(candidatePath, JSON.stringify({
    schemaVersion: 1, sourceCommit, appVersion: '0.2.0', runtimeVersion: '0.2.0', profile: 'production', channel: 'production',
    screenshotEvidenceSha256: crypto.createHash('sha256').update(fs.readFileSync(screenshotPath)).digest('hex'),
    frozenAt: '2026-09-08T00:05:00.000Z'
  }));
  return { root, candidatePath, screenshotPath };
}

function rawBuild(platform) {
  return {
    id: platform === 'IOS' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
    status: 'FINISHED', platform, distribution: 'STORE', buildProfile: 'production',
    app: { id: 'cc29573d-d20c-4c3b-a7d6-1bc74838127a', slug: 'trrb' },
    updateChannel: { id: 'channel-id', name: 'production' },
    runtime: { id: 'runtime-id', version: '0.2.0' },
    appVersion: '0.2.0', appBuildVersion: '3', gitCommitHash: sourceCommit,
    createdAt: '2026-09-08T00:10:00.000Z', completedAt: '2026-09-08T00:20:00.000Z',
    artifacts: { buildUrl: 'https://example.invalid/app?token=do-not-copy' },
    initiatingActor: { email: 'private@example.invalid' }
  };
}

function generate(t, ios = rawBuild('IOS'), android = rawBuild('ANDROID')) {
  const { root, candidatePath, screenshotPath } = fixture(t);
  return createBuildEvidence({
    mobileRoot: root, iosBuild: ios, androidBuild: android,
    releaseCandidatePath: candidatePath, screenshotEvidencePath: screenshotPath,
    expectedSourceCommit: sourceCommit, verifyCandidateFiles: false
  });
}

test('converts current EAS CLI build JSON into paired sanitized evidence', (t) => {
  const result = generate(t);
  assert.equal(result.valid, true, result.failures.join('\n'));
  assert.deepEqual(result.evidence.builds.map(({ platform, artifactType }) => [platform, artifactType]), [['ios', 'ipa'], ['android', 'aab']]);
  const serialized = JSON.stringify(result.evidence);
  assert.doesNotMatch(serialized, /https?:|token|private@example|artifacts|initiatingActor/);
});

test('rejects legacy EAS JSON whose schema could map ambiguous release data', (t) => {
  const ios = rawBuild('IOS');
  delete ios.app;
  delete ios.updateChannel;
  delete ios.runtime;
  ios.project = { id: 'cc29573d-d20c-4c3b-a7d6-1bc74838127a' };
  ios.channel = 'production';
  ios.runtimeVersion = '0.2.0';
  const result = generate(t, ios);
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /current EAS CLI app\/updateChannel\/runtime shape/);
});

test('rejects an unfinished build or a build from another project and release', (t) => {
  const android = rawBuild('ANDROID');
  android.status = 'IN_PROGRESS';
  android.app.id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  android.gitCommitHash = 'a'.repeat(40);
  const result = generate(t, rawBuild('IOS'), android);
  assert.equal(result.valid, false);
  assert.match(result.failures.join('\n'), /different Expo project/);
  assert.match(result.failures.join('\n'), /must be finished/);
  assert.match(result.failures.join('\n'), /source commit/);
});

test('rejects swapped platforms, wrong profile, channel, runtime or native version', (t) => {
  const ios = rawBuild('ANDROID');
  ios.buildProfile = 'preview';
  ios.updateChannel.name = 'preview';
  ios.runtime.version = '0.1.0';
  ios.appBuildVersion = '0';
  const result = generate(t, ios);
  assert.equal(result.valid, false);
  const failures = result.failures.join('\n');
  assert.match(failures, /wrong platform/);
  assert.match(failures, /production profile/);
  assert.match(failures, /production update channel/);
  assert.match(failures, /runtime version/);
  assert.match(failures, /positive integer/);
});

test('limits raw EAS inputs and generated evidence to local JSON files in the store directory', () => {
  const mobileRoot = path.join(path.sep, 'workspace', 'apps', 'mobile');
  assert.equal(resolveBuildEvidenceLocalPath({ mobileRoot }).valid, true);
  assert.equal(resolveBuildEvidenceLocalPath({ mobileRoot, filePath: 'store/eas-ios.local.json' }).valid, true);
  assert.equal(resolveBuildEvidenceLocalPath({ mobileRoot, filePath: 'store/eas-ios.json' }).valid, false);
  assert.equal(resolveBuildEvidenceLocalPath({ mobileRoot, filePath: '../eas-ios.local.json' }).valid, false);
});
