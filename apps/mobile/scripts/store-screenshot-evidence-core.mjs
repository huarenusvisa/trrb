import fs from 'node:fs';
import path from 'node:path';
import { readPngInfo, validateStoreSubmissionAssets } from './store-submission-assets-core.mjs';

const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const DIGEST = /^[0-9a-f]{64}$/i;
const ROOT_KEYS = ['schemaVersion', 'sourceCommit', 'appVersion', 'locale', 'capturedAt', 'sets'];
const SET_KEYS = ['id', 'deviceClass', 'directory', 'screenshots'];
const SCREENSHOT_KEYS = ['name', 'width', 'height', 'sha256'];

function hasOnlyKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key));
}

function validIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

function expectedSets(manifest) {
  return [
    ['app-store-iphone69', 'iphone-6.9', manifest.appStore?.iphone69],
    ['app-store-ipad13', 'ipad-13', manifest.appStore?.ipad13],
    ['google-play-phone', 'android-phone', manifest.googlePlay]
  ].map(([id, deviceClass, config]) => ({ id, deviceClass, config }));
}

function dimensionsAccepted(config, width, height) {
  if (config.acceptedPortraitSizes) {
    return config.acceptedPortraitSizes.some(([acceptedWidth, acceptedHeight]) => width === acceptedWidth && height === acceptedHeight);
  }
  const minimum = Math.min(width, height);
  const maximum = Math.max(width, height);
  return width < height && minimum >= config.minimumDimension && maximum <= config.maximumDimension
    && maximum / minimum <= config.maximumAspectRatio;
}

export function inspectScreenshotEvidence({ mobileRoot, evidence, expectedSourceCommit, verifyFiles = true }) {
  const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo;
  const manifest = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'store/submission-assets.json'), 'utf8'));
  const failures = verifyFiles ? [...validateStoreSubmissionAssets(mobileRoot)] : [];
  const expect = (condition, message) => { if (!condition) failures.push(message); };

  expect(hasOnlyKeys(evidence, ROOT_KEYS), 'Screenshot evidence contains unsupported root fields');
  expect(evidence?.schemaVersion === 1, 'Screenshot evidence schemaVersion must be 1');
  expect(COMMIT_SHA.test(evidence?.sourceCommit ?? ''), 'Screenshot evidence sourceCommit must be a full Git commit SHA');
  if (expectedSourceCommit) expect(evidence?.sourceCommit === expectedSourceCommit, 'Screenshot evidence does not belong to the checked-out Git commit');
  expect(evidence?.appVersion === app.version, 'Screenshot evidence app version does not match app.json');
  expect(evidence?.locale === 'zh-CN', 'Screenshot evidence locale must be zh-CN for the first store listing');
  expect(validIsoDate(evidence?.capturedAt), 'Screenshot evidence capturedAt must be an ISO timestamp');

  const sets = Array.isArray(evidence?.sets) ? evidence.sets : [];
  const expected = expectedSets(manifest);
  expect(sets.length === expected.length, 'Screenshot evidence must contain iPhone, iPad and Android phone sets');
  expect(new Set(sets.map((set) => set?.id)).size === sets.length, 'Screenshot evidence contains duplicate sets');
  const allDigests = new Set();

  expected.forEach(({ id, deviceClass, config }, setIndex) => {
    const set = sets[setIndex];
    expect(Boolean(set), `Screenshot evidence is missing ${id}`);
    if (!set) return;
    expect(hasOnlyKeys(set, SET_KEYS), `${id} contains unsupported or sensitive fields`);
    expect(set.id === id, `Screenshot evidence set ${setIndex + 1} must be ${id}`);
    expect(set.deviceClass === deviceClass, `${id} has the wrong device class`);
    expect(set.directory === config?.directory, `${id} directory does not match the submission manifest`);
    const screenshots = Array.isArray(set.screenshots) ? set.screenshots : [];
    expect(JSON.stringify(screenshots.map((item) => item?.name)) === JSON.stringify(manifest.screens), `${id} screenshot order is incomplete or incorrect`);

    screenshots.forEach((screenshot) => {
      expect(hasOnlyKeys(screenshot, SCREENSHOT_KEYS), `${id} ${screenshot?.name ?? 'screenshot'} contains unsupported fields`);
      expect(Number.isInteger(screenshot?.width) && Number.isInteger(screenshot?.height), `${id} ${screenshot?.name} dimensions must be integers`);
      if (Number.isInteger(screenshot?.width) && Number.isInteger(screenshot?.height)) {
        expect(dimensionsAccepted(config, screenshot.width, screenshot.height), `${id} ${screenshot.name} has unsupported dimensions`);
      }
      expect(DIGEST.test(screenshot?.sha256 ?? ''), `${id} ${screenshot?.name} must include a SHA-256 digest`);
      expect(!allDigests.has(screenshot?.sha256), `${id} ${screenshot?.name} duplicates another screenshot digest`);
      allDigests.add(screenshot?.sha256);

      if (verifyFiles) {
        const filePath = path.join(mobileRoot, set.directory, `${screenshot.name}.png`);
        if (fs.existsSync(filePath)) {
          const info = readPngInfo(filePath);
          expect(!info.error && info.width === screenshot.width && info.height === screenshot.height, `${id} ${screenshot.name} file dimensions do not match evidence`);
          expect(info.digest === screenshot.sha256, `${id} ${screenshot.name} file digest does not match evidence`);
        }
      }
    });
  });

  return { valid: failures.length === 0, failures };
}

export function readScreenshotEvidence({ mobileRoot, evidencePath, expectedSourceCommit, verifyFiles = true }) {
  try {
    const absolutePath = path.isAbsolute(evidencePath) ? evidencePath : path.resolve(mobileRoot, evidencePath);
    const evidence = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    return inspectScreenshotEvidence({ mobileRoot, evidence, expectedSourceCommit, verifyFiles });
  } catch {
    return { valid: false, failures: ['Unable to read or parse the local screenshot evidence file'] };
  }
}
