import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));

test('renders the complete production mobile website inside the app', () => {
  assert.match(app, /https:\/\/asylumjudge\.com\//);
  assert.match(app, /react-native-webview/);
  assert.match(app, /allowsBackForwardNavigationGestures/);
  assert.match(app, /pullToRefreshEnabled/);
  assert.equal(packageJson.dependencies['react-native-webview'], '13.16.1');
});

test('keeps AsylumJudge and Tang Daily navigation inside the app', () => {
  assert.match(app, /asylumjudge\.com/);
  assert.match(app, /trrb\.net/);
  assert.match(app, /isTrustedWebUrl/);
  assert.match(app, /Linking\.openURL/);
});

test('uses the same compact mobile community mode as the Tang Daily app', () => {
  assert.match(app, /COMMUNITY_COMPACT_SCRIPT/);
  assert.match(app, /path === '\/community'/);
  assert.match(app, /'app-embedded'/);
  assert.match(app, /injectedJavaScriptBeforeContentLoaded=\{COMMUNITY_COMPACT_SCRIPT\}/);
});

test('keeps the existing product identity and increments the release', () => {
  assert.equal(config.expo.owner, 'tang-daily-llc');
  assert.equal(config.expo.extra.eas.projectId, '4443f235-79a2-4508-afe3-736331b9ae7b');
  assert.equal(config.expo.ios.bundleIdentifier, 'com.asylumjudge.mobile');
  assert.equal(config.expo.android.package, 'com.asylumjudge.mobile');
  assert.equal(config.expo.version, '1.0.1');
  assert.equal(config.expo.icon, './assets/icon.png');
  assert.equal(eas.build.preview.distribution, 'internal');
  assert.equal(eas.submit.production.ios.ascAppId, '6810855760');
});
