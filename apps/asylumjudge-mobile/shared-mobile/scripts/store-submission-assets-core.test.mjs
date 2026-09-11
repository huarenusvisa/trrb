import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateStoreSubmissionAssets } from './store-submission-assets-core.mjs';

const screens = ['01-home', '02-community'];

function png(width, height, colorType = 2, marker = 0) {
  const data = Buffer.alloc(30);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(data);
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  data[25] = colorType;
  data[29] = marker;
  return data;
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trrb-store-assets-'));
  fs.mkdirSync(path.join(root, 'store/google-play/screenshots/phone'), { recursive: true });
  fs.mkdirSync(path.join(root, 'store/app-store/screenshots/iphone-6.9'), { recursive: true });
  fs.mkdirSync(path.join(root, 'store/app-store/screenshots/ipad-13'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify({ expo: { ios: { supportsTablet: true } } }));
  fs.mkdirSync(path.join(root, 'store/google-play'), { recursive: true });
  fs.writeFileSync(path.join(root, 'store/google-play/listing.json'), JSON.stringify({ phoneScreenshots: screens }));
  fs.writeFileSync(path.join(root, 'store/submission-assets.json'), JSON.stringify({
    screens,
    appStore: {
      iphone69: { directory: 'store/app-store/screenshots/iphone-6.9', acceptedPortraitSizes: [[1290, 2796]] },
      ipad13: { directory: 'store/app-store/screenshots/ipad-13', acceptedPortraitSizes: [[2048, 2732]] }
    },
    googlePlay: {
      directory: 'store/google-play/screenshots/phone',
      minimumDimension: 320,
      maximumDimension: 3840,
      maximumAspectRatio: 2
    }
  }));
  screens.forEach((screen, index) => {
    fs.writeFileSync(path.join(root, `store/google-play/screenshots/phone/${screen}.png`), png(1080, 1920, 2, index));
    fs.writeFileSync(path.join(root, `store/app-store/screenshots/iphone-6.9/${screen}.png`), png(1290, 2796, 2, index));
    fs.writeFileSync(path.join(root, `store/app-store/screenshots/ipad-13/${screen}.png`), png(2048, 2732, 2, index));
  });
  return root;
}

test('accepts complete, unique and correctly sized store screenshot sets', () => {
  const root = fixture();
  try {
    assert.deepEqual(validateStoreSubmissionAssets(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('reports missing, invalid-sized, transparent and duplicate screenshots', () => {
  const root = fixture();
  try {
    fs.rmSync(path.join(root, 'store/google-play/screenshots/phone/01-home.png'));
    fs.writeFileSync(path.join(root, 'store/app-store/screenshots/iphone-6.9/01-home.png'), png(1170, 2532, 6));
    fs.copyFileSync(
      path.join(root, 'store/app-store/screenshots/ipad-13/01-home.png'),
      path.join(root, 'store/app-store/screenshots/ipad-13/02-community.png')
    );
    const failures = validateStoreSubmissionAssets(root).join('\n');
    assert.match(failures, /Google Play phone screenshot is missing/);
    assert.match(failures, /must not contain alpha or transparency/);
    assert.match(failures, /unsupported dimensions 1170x2532/);
    assert.match(failures, /duplicates another screenshot/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('requires an iPad set while the app advertises tablet support', () => {
  const root = fixture();
  try {
    const manifestPath = path.join(root, 'store/submission-assets.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    delete manifest.appStore.ipad13;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.match(validateStoreSubmissionAssets(root).join('\n'), /iPad screenshot set is required/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
