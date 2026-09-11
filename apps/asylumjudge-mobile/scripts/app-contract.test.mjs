import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));

test('renders the required native bottom navigation in the exact product order', () => {
  const orderedLabels = ['法院数据', '社区', 'BIA裁决', '庇护知识', '我的'];
  let cursor = -1;
  for (const label of orderedLabels) {
    const next = app.indexOf(`label: '${label}'`);
    assert.ok(next > cursor, `${label} must appear in the requested order`);
    cursor = next;
  }
  assert.match(app, /accessibilityRole="tablist"/);
  assert.match(app, /accessibilityRole="tab"/);
  assert.match(app, /styles\.tabBar/);
});

test('connects each tab to its production route', () => {
  assert.match(app, /https:\/\/asylumjudge\.com\//);
  assert.match(app, /https:\/\/trrb\.net\/community\/\?app=1/);
  assert.match(app, /https:\/\/trrb\.net\/legal\/\?app=1&source=asylumjudge/);
  assert.match(app, /https:\/\/trrb\.net\/immigrate\/center\?path=humanitarian&app=1/);
  assert.match(app, /account=1/);
});

test('applies mobile app chrome and keeps the compact community mode', () => {
  assert.match(app, /NATIVE_APP_SCRIPT/);
  assert.match(app, /asylumjudge-native-app/);
  assert.match(app, /app-embedded/);
  assert.match(app, /home-nav \{ display: none/);
  assert.match(app, /injectedJavaScriptBeforeContentLoaded=\{NATIVE_APP_SCRIPT\}/);
});

test('preserves the official app identity for the next release', () => {
  assert.equal(config.expo.owner, 'tang-daily-llc');
  assert.equal(config.expo.extra.eas.projectId, '4443f235-79a2-4508-afe3-736331b9ae7b');
  assert.equal(config.expo.ios.bundleIdentifier, 'com.asylumjudge.mobile');
  assert.equal(config.expo.version, '1.0.2');
  assert.equal(config.expo.ios.buildNumber, '5');
  assert.equal(config.expo.icon, './assets/icon.png');
});
