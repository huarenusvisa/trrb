import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createReleaseCandidate,
  inspectReleaseCandidate,
  resolveReleaseCandidateOutput
} from './store-release-candidate-core.mjs';

const sourceCommit = '1234567890abcdef1234567890abcdef12345678';
const screens = ['01-home', '02-america', '03-immigration', '04-legal', '05-community'];

function png(width, height, marker) {
  const data = Buffer.alloc(30);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(data);
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  data[25] = 2;
  data[29] = marker;
  return data;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trrb-release-candidate-'));
  const configs = [
    { id: 'app-store-iphone69', deviceClass: 'iphone-6.9', directory: 'store/app-store/screenshots/iphone-6.9', width: 1290, height: 2796 },
    { id: 'app-store-ipad13', deviceClass: 'ipad-13', directory: 'store/app-store/screenshots/ipad-13', width: 2048, height: 2732 },
    { id: 'google-play-phone', deviceClass: 'android-phone', directory: 'store/google-play/screenshots/phone', width: 1080, height: 1920 }
  ];
  fs.mkdirSync(path.join(root, 'store/google-play'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: { version: '0.2.0', runtimeVersion: { policy: 'appVersion' }, ios: { supportsTablet: true } } }));
  fs.writeFileSync(path.join(root, 'store/google-play/listing.json'), JSON.stringify({ phoneScreenshots: screens }));
  fs.writeFileSync(path.join(root, 'store/submission-assets.json'), JSON.stringify({
    screens,
    appStore: {
      iphone69: { directory: configs[0].directory, acceptedPortraitSizes: [[1290, 2796]] },
      ipad13: { directory: configs[1].directory, acceptedPortraitSizes: [[2048, 2732]] }
    },
    googlePlay: { directory: configs[2].directory, minimumDimension: 320, maximumDimension: 3840, maximumAspectRatio: 2 }
  }));
  const sets = configs.map((config, setIndex) => {
    fs.mkdirSync(path.join(root, config.directory), { recursive: true });
    return {
      id: config.id, deviceClass: config.deviceClass, directory: config.directory,
      screenshots: screens.map((name, screenIndex) => {
        const data = png(config.width, config.height, setIndex * screens.length + screenIndex);
        fs.writeFileSync(path.join(root, config.directory, `${name}.png`), data);
        return { name, width: config.width, height: config.height, sha256: crypto.createHash('sha256').update(data).digest('hex') };
      })
    };
  });
  const screenshotPath = path.join(root, 'store/screenshot-evidence.local.json');
  fs.writeFileSync(screenshotPath, `${JSON.stringify({
    schemaVersion: 1, sourceCommit, appVersion: '0.2.0', locale: 'zh-CN',
    capturedAt: '2026-09-08T12:00:00.000Z', sets
  }, null, 2)}\n`);
  return { root, screenshotPath };
}

test('freezes the current release commit with its verified 15 screenshots', () => {
  const { root, screenshotPath } = fixture();
  try {
    const result = createReleaseCandidate({
      mobileRoot: root, screenshotEvidencePath: screenshotPath, sourceCommit,
      frozenAt: '2026-09-08T12:05:00.000Z'
    });
    assert.equal(result.valid, true, result.failures.join('\n'));
    assert.equal(result.candidate.appVersion, '0.2.0');
    assert.equal(result.candidate.runtimeVersion, '0.2.0');
    assert.equal(result.candidate.profile, 'production');
    assert.equal(result.candidate.channel, 'production');
    assert.match(result.candidate.screenshotEvidenceSha256, /^[0-9a-f]{64}$/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('rejects another commit, version, runtime or replaced screenshot evidence', () => {
  const { root, screenshotPath } = fixture();
  try {
    const created = createReleaseCandidate({ mobileRoot: root, screenshotEvidencePath: screenshotPath, sourceCommit });
    const candidate = { ...created.candidate, sourceCommit: 'a'.repeat(40), appVersion: '0.1.0', runtimeVersion: '0.1.0' };
    fs.appendFileSync(screenshotPath, ' ');
    const result = inspectReleaseCandidate({ mobileRoot: root, candidate, screenshotEvidencePath: screenshotPath, expectedSourceCommit: sourceCommit });
    assert.equal(result.valid, false);
    assert.match(result.failures.join('\n'), /checked-out Git commit/);
    assert.match(result.failures.join('\n'), /app version/);
    assert.match(result.failures.join('\n'), /runtime version/);
    assert.match(result.failures.join('\n'), /digest does not match/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('rejects unsafe metadata and a freeze preceding screenshot capture', () => {
  const { root, screenshotPath } = fixture();
  try {
    const created = createReleaseCandidate({ mobileRoot: root, screenshotEvidencePath: screenshotPath, sourceCommit });
    const candidate = { ...created.candidate, frozenAt: '2026-09-08T11:59:00.000Z', credentials: 'secret' };
    const result = inspectReleaseCandidate({ mobileRoot: root, candidate, screenshotEvidencePath: screenshotPath, expectedSourceCommit: sourceCommit });
    assert.equal(result.valid, false);
    assert.match(result.failures.join('\n'), /unsupported or sensitive fields/);
    assert.match(result.failures.join('\n'), /before its screenshots/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('reports a missing screenshot evidence path without throwing', () => {
  const { root } = fixture();
  try {
    const result = inspectReleaseCandidate({
      mobileRoot: root,
      candidate: {},
      expectedSourceCommit: sourceCommit
    });
    assert.equal(result.valid, false);
    assert.match(result.failures.join('\n'), /Screenshot evidence path is required/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('limits candidate freezes to ignored local JSON files in the store directory', () => {
  const mobileRoot = path.join(path.sep, 'workspace', 'apps', 'mobile');
  assert.equal(resolveReleaseCandidateOutput({ mobileRoot }).valid, true);
  assert.equal(resolveReleaseCandidateOutput({ mobileRoot, output: 'store/candidate.local.json' }).valid, true);
  assert.equal(resolveReleaseCandidateOutput({ mobileRoot, output: 'store/candidate.json' }).valid, false);
  assert.equal(resolveReleaseCandidateOutput({ mobileRoot, output: '../candidate.local.json' }).valid, false);
});
