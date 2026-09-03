import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('wires persisted language selection through root, tabs and profile', () => {
  const root = read('app/_layout.tsx');
  const tabs = read('app/(tabs)/_layout.tsx');
  const profile = read('app/(tabs)/profile.tsx');
  const settings = read('app/language-settings.tsx');
  const provider = read('src/i18n/I18nProvider.tsx');

  assert.match(root, /<I18nProvider>/);
  for (const key of ['tab.home', 'tab.america', 'tab.immigration', 'tab.legal', 'tab.profile']) {
    assert.ok(tabs.includes(`t('${key}')`), `tab layout must translate ${key}`);
  }
  assert.match(profile, /testID="open-language-settings"/);
  assert.match(profile, /router\.push\('\/language-settings'\)/);
  for (const preference of ['system', 'zh-CN', 'zh-TW', 'en']) {
    assert.ok(settings.includes(`preference: '${preference}'`), `language screen must expose ${preference}`);
  }
  assert.match(provider, /AsyncStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(provider, /AsyncStorage\.setItem\(STORAGE_KEY, safePreference\)/);
  assert.match(provider, /AppState\.addEventListener\('change'/);
});
