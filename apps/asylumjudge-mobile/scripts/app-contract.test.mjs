import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));

test('renders the required native bottom navigation in the exact product order', () => {
  const orderedLabels = ['移民法院数据', '社区', 'BIA裁决', '庇护知识', '我的中心'];
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
  assert.match(app, /ProfileScreen/);
});

test('renders the complete Tang Daily native profile and shared account stack', () => {
  assert.match(app, /ProfileScreen from '.\/shared-mobile\/app\/\(tabs\)\/profile'/);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.main, 'expo-router/entry');
  assert.ok(pkg.dependencies['@supabase/supabase-js']);
  assert.ok(pkg.dependencies['@react-native-async-storage/async-storage']);
  assert.equal(pkg.dependencies['expo-asset'], '~57.0.16');
  assert.equal(pkg.dependencies['react-native-reanimated'], '4.5.1');
  assert.equal(pkg.dependencies['react-native-screens'], '4.26.0');
  assert.equal(pkg.dependencies['react-native-worklets'], '0.10.1');
  assert.equal(pkg.overrides['react-native-reanimated'], '4.5.1');
  assert.equal(pkg.overrides['react-native-screens'], '4.26.0');
  assert.equal(pkg.overrides['react-native-worklets'], '0.10.1');
});

test('ships clean shared localization source', () => {
  const i18n = readFileSync(new URL('../shared-mobile/src/i18n/i18n-core.ts', import.meta.url), 'utf8');
  assert.match(i18n, /^export const SUPPORTED_LOCALES/);
  assert.doesNotMatch(i18n, /Warning: truncated output/);
});

test('applies mobile app chrome and keeps the compact community mode', () => {
  assert.match(app, /NATIVE_APP_SCRIPT/);
  assert.match(app, /asylumjudge-native-app/);
  assert.match(app, /app-embedded/);
  assert.match(app, /home-nav \{ display: none/);
  assert.match(app, /injectedJavaScriptBeforeContentLoaded=\{NATIVE_APP_SCRIPT\}/);
  assert.match(app, /injectedJavaScript=\{NATIVE_APP_SCRIPT\}/);
  assert.match(app, /webViewRef\.current\?\.injectJavaScript\(NATIVE_APP_SCRIPT\)/);
  assert.match(app, /width: min\(100%, 760px\)/);
  assert.match(app, /automaticallyAdjustContentInsets=\{false\}/);
  assert.match(app, /textZoom=\{100\}/);
});

test('removes Tang Daily chrome and explanatory copy from the in-app BIA hub', () => {
  assert.match(app, /path\.startsWith\('\/legal'\)/);
  assert.match(app, /asylumjudge-legal-page \.legal-header/);
  assert.match(app, /asylumjudge-legal-page \.hero > \.eyebrow/);
  assert.match(app, /asylumjudge-legal-page \.hero > p:not\(\.eyebrow\)/);
  assert.match(app, /asylumjudge-legal-page \.hero h1 \{ margin: 0/);
  assert.match(app, /querySelectorAll\('\.legal-header, \.hero > \.eyebrow, \.hero > p:not\(\.eyebrow\)'\)/);
  assert.match(app, /MutationObserver\(applyNativePresentation\)/);
});

test('uses comfortable mobile typography and spacing without horizontal scaling', () => {
  assert.match(app, /font-size: 16px !important; line-height: 1\.55/);
  assert.match(app, /trend-scope-controls label \{[^}]*font-size: 13px/);
  assert.match(app, /trend-scope-controls select \{[^}]*min-height: 50px/);
  assert.match(app, /asylumjudge-legal-page \.filters label \{[^}]*font-size: 14px/);
  assert.match(app, /minHeight: 58/);
  assert.match(app, /fontSize: 11\.5, lineHeight: 15/);
  assert.match(app, /textZoom=\{100\}/);
});

test('uses a compact two-column BIA filter form on phones', () => {
  assert.match(app, /grid-template-areas: "query query" "source body" "type sort" "from to" "reset reset"/);
  assert.match(app, /asylumjudge-legal-page \.filters #legal-reset \{ grid-area: reset; color: #14804a/);
  assert.match(app, /asylumjudge-legal-page main\.wrap \{ width: calc\(100% - 28px\)/);
});

test('uses the AsylumJudge green palette throughout the profile home', () => {
  const profile = readFileSync(new URL('../shared-mobile/app/(tabs)/profile.tsx', import.meta.url), 'utf8');
  const hero = readFileSync(new URL('../shared-mobile/src/components/ProfileHero.tsx', import.meta.url), 'utf8');
  assert.match(profile, /languageOptionActive:\{backgroundColor:'#14804a'\}/);
  assert.match(profile, /login:\{[^}]*backgroundColor:'#14804a'/);
  assert.match(profile, /publish:\{[^}]*backgroundColor:'#14804a'/);
  assert.doesNotMatch(profile, /#c8211e/);
  assert.match(hero, /coverFallback:\{[^}]*backgroundColor:'#116b40'/);
  assert.match(hero, /avatarEdit:\{[^}]*backgroundColor:'#14804a'/);
});

test('localizes app tabs and recovery states without oversized navigation', () => {
  const i18n = readFileSync(new URL('../shared-mobile/src/i18n/i18n-core.ts', import.meta.url), 'utf8');
  for (const key of ['asylumApp.tabData', 'asylumApp.tabCommunity', 'asylumApp.tabBia', 'asylumApp.tabKnowledge', 'asylumApp.tabProfile', 'asylumApp.errorTitle', 'asylumApp.retry']) {
    assert.ok(app.includes(key), `App must use ${key}`);
    assert.ok(i18n.includes(`'${key}'`), `translations must define ${key}`);
  }
  assert.match(app, /minHeight: 58/);
  assert.match(app, /adjustsFontSizeToFit/);
  assert.doesNotMatch(app, />页面暂时无法打开</);
});

test('keeps the native profile responsive on narrow screens and large text', () => {
  const profile = readFileSync(new URL('../shared-mobile/app/(tabs)/profile.tsx', import.meta.url), 'utf8');
  assert.match(profile, /useWindowDimensions\(\)/);
  assert.match(profile, /width < 390 \|\| deviceFontScale > 1\.15/);
  assert.match(profile, /primaryActionsCompact/);
  assert.match(profile, /maxWidth:720/);
  assert.doesNotMatch(profile, /paddingTop:54/);
});

test('preserves the official app identity for the next release', () => {
  assert.equal(config.expo.owner, 'tang-daily-llc');
  assert.equal(config.expo.extra.eas.projectId, '4443f235-79a2-4508-afe3-736331b9ae7b');
  assert.equal(config.expo.ios.bundleIdentifier, 'com.asylumjudge.mobile');
  assert.equal(config.expo.version, '1.0.3');
  assert.equal(config.expo.ios.buildNumber, '9');
  assert.equal(config.expo.icon, './assets/icon.png');
});

test('declares native permissions for profile media, chat audio and notifications', () => {
  const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8')).expo;
  assert.ok(config.plugins.includes('expo-notifications'));
  const imagePicker = config.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker');
  const audio = config.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-audio');
  assert.match(imagePicker?.[1]?.photosPermission || '', /移民法官/);
  assert.equal(imagePicker?.[1]?.cameraPermission, false);
  assert.match(audio?.[1]?.microphonePermission || '', /语音消息/);
  assert.equal(audio?.[1]?.enableBackgroundRecording, false);
  assert.match(config.ios?.infoPlist?.NSMicrophoneUsageDescription || '', /语音消息/);
  assert.equal(config.ios?.privacyManifests?.NSPrivacyTracking, false);
  assert.equal(config.runtimeVersion?.policy, 'appVersion');
  assert.match(config.updates?.url || '', /4443f235-79a2-4508-afe3-736331b9ae7b/);
});
