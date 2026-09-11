import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createScreenshotEvidence,
  inspectScreenshotEvidence,
  resolveScreenshotEvidenceOutput
} from './store-screenshot-evidence-core.mjs';

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trrb-screenshot-evidence-'));
  const configs = [
    { id: 'app-store-iphone69', deviceClass: 'iphone-6.9', directory: 'store/app-store/screenshots/iphone-6.9', width: 1290, height: 2796 },
    { id: 'app-store-ipad13', deviceClass: 'ipad-13', directory: 'store/app-store/screenshots/ipad-13', width: 2048, height: 2732 },
    { id: 'google-play-phone', deviceClass: 'android-phone', directory: 'store/google-play/screenshots/phone', width: 1080, height: 1920 }
  ];
  fs.mkdirSync(path.join(root, 'store/google-play'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: { version: '0.2.0', ios: { supportsTablet: true } } }));
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
    const screenshots = screens.map((name, screenIndex) => {
      const data = png(config.width, config.height, setIndex * screens.length + screenIndex);
      fs.writeFileSync(path.join(root, config.directory, `${name}.png`), data);
      return { name, width: config.width, height: config.height, sha256: crypto.createHash('sha256').update(data).digest('hex') };
    });
    return { id: config.id, deviceClass: config.deviceClass, directory: config.directory, screenshots };
  });
  const evidence = { schemaVersion: 1, sourceCommit, appVersion: '0.2.0', locale: 'zh-CN', capturedAt: '2026-09-08T00:00:00.000Z', sets };
  return { root, evidence };
}

test('accepts 15 version-bound screenshots matching the physical files', () => {
  const { root, evidence } = fixture();
  try {
    const result = inspectScreenshotEvidence({ mobileRoot: root, evidence, expectedSourceCommit: sourceCommit });
    assert.equal(result.valid, true, result.failures.join('\n'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('generates complete evidence directly from all 15 physical screenshots', () => {
  const { root, evidence } = fixture();
  try {
    const result = createScreenshotEvidence({
      mobileRoot: root,
      sourceCommit,
      capturedAt: evidence.capturedAt
    });
    assert.equal(result.valid, true, result.failures.join('\n'));
    assert.deepEqual(result.evidence, evidence);
    assert.equal(result.evidence.sets.flatMap(({ screenshots }) => screenshots).length, 15);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('does not generate evidence from incomplete or uncommitted inputs', () => {
  const { root, evidence } = fixture();
  try {
    fs.rmSync(path.join(root, evidence.sets[0].directory, '01-home.png'));
    const result = createScreenshotEvidence({ mobileRoot: root, sourceCommit: 'not-a-commit' });
    assert.equal(result.valid, false);
    assert.equal(result.evidence, null);
    assert.match(result.failures.join('\n'), /screenshot is missing/);
    assert.match(result.failures.join('\n'), /full Git commit SHA/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('limits generated evidence to ignored local JSON files in the store directory', () => {
  const mobileRoot = path.join(path.sep, 'workspace', 'apps', 'mobile');
  assert.equal(resolveScreenshotEvidenceOutput({ mobileRoot }).valid, true);
  assert.equal(resolveScreenshotEvidenceOutput({ mobileRoot, output: 'store/release.local.json' }).valid, true);
  assert.equal(resolveScreenshotEvidenceOutput({ mobileRoot, output: 'store/release.json' }).valid, false);
  assert.equal(resolveScreenshotEvidenceOutput({ mobileRoot, output: '../release.local.json' }).valid, false);
  assert.equal(resolveScreenshotEvidenceOutput({ mobileRoot, output: '/tmp/release.local.json' }).valid, false);
});

test('rejects another release commit, app version or listing locale', () => {
  const { root, evidence } = fixture();
  try {
    evidence.sourceCommit = 'a'.repeat(40);
    evidence.appVersion = '0.1.0';
    evidence.locale = 'en-US';
    const result = inspectScreenshotEvidence({ mobileRoot: root, evidence, expectedSourceCommit: sourceCommit });
    assert.equal(result.valid, false);
    assert.match(result.failures.join('\n'), /checked-out Git commit/);
    assert.match(result.failures.join('\n'), /app version/);
    assert.match(result.failures.join('\n'), /locale must be zh-CN/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('rejects wrong set order, unsupported dimensions and duplicate digests', () => {
  const { root, evidence } = fixture();
  try {
    [evidence.sets[0], evidence.sets[1]] = [evidence.sets[1], evidence.sets[0]];
    evidence.sets[2].screenshots[0].width = 100;
    evidence.sets[2].screenshots[1].sha256 = evidence.sets[2].screenshots[0].sha256;
    const result = inspectScreenshotEvidence({ mobileRoot: root, evidence, verifyFiles: false });
    assert.equal(result.valid, false);
    assert.match(result.failures.join('\n'), /must be app-store-iphone69/);
    assert.match(result.failures.join('\n'), /unsupported dimensions/);
    assert.match(result.failures.join('\n'), /duplicates another screenshot digest/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('rejects replaced files and sensitive evidence fields', () => {
  const { root, evidence } = fixture();
  try {
    evidence.credentials = { token: 'secret' };
    evidence.sets[0].uploadUrl = 'https://example.invalid/screenshot?token=secret';
    fs.writeFileSync(path.join(root, evidence.sets[1].directory, '01-home.png'), png(2048, 2732, 99));
    const result = inspectScreenshotEvidence({ mobileRoot: root, evidence });
    assert.equal(result.valid, false);
    assert.match(result.failures.join('\n'), /unsupported root fields/);
    assert.match(result.failures.join('\n'), /sensitive fields/);
    assert.match(result.failures.join('\n'), /file digest does not match evidence/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
