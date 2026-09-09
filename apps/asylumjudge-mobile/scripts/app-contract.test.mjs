import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));

test('uses the production directory API and bounded list rendering', () => {
  assert.match(app, /immigration-judges\?mode=directory/);
  assert.match(app, /FlatList/);
  assert.match(app, /initialNumToRender=\{20\}/);
});

test('supports search, clear, retry and judge details', () => {
  assert.match(app, /normalize\(query\)/);
  assert.match(app, /accessibilityLabel="清除搜索"/);
  assert.match(app, /重新尝试/);
  assert.match(app, /asylumjudge\.com/);
});

test('has separate native identities and internal Android testing', () => {
  assert.equal(config.expo.ios.bundleIdentifier, 'com.asylumjudge.mobile');
  assert.equal(config.expo.android.package, 'com.asylumjudge.mobile');
  assert.equal(eas.build.preview.distribution, 'internal');
  assert.equal(eas.build.preview.android.buildType, 'apk');
  assert.equal(eas.submit.production.android.track, 'internal');
});
