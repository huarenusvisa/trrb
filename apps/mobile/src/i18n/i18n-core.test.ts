import assert from 'node:assert/strict';
import test from 'node:test';
import { languageName, normalizeLocale, normalizeLocalePreference, resolveLocale, translate } from './i18n-core.ts';

test('maps supported system locale variants without confusing Traditional and Simplified Chinese', () => {
  assert.equal(normalizeLocale('zh-Hant-HK'), 'zh-TW');
  assert.equal(normalizeLocale('zh_TW'), 'zh-TW');
  assert.equal(normalizeLocale('zh-Hans-SG'), 'zh-CN');
  assert.equal(normalizeLocale('zh-CN'), 'zh-CN');
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('es-US'), 'zh-CN');
});

test('keeps valid persisted choices and safely resets invalid storage values', () => {
  assert.equal(normalizeLocalePreference('system'), 'system');
  assert.equal(normalizeLocalePreference('zh-TW'), 'zh-TW');
  assert.equal(normalizeLocalePreference('es'), 'system');
  assert.equal(resolveLocale('system', 'en-GB'), 'en');
  assert.equal(resolveLocale('zh-CN', 'en-US'), 'zh-CN');
});

test('translates navigation and interpolates dynamic profile values', () => {
  assert.equal(translate('zh-TW', 'tab.home'), '首頁');
  assert.equal(translate('en', 'tab.legal'), 'Legal');
  assert.equal(translate('en', 'profile.unread', { count: 3 }), ' · 3 unread');
  assert.equal(translate('zh-CN', 'profile.loggedIn', { account: 'reader@example.com' }), '已登录 · reader@example.com');
});

test('returns endonyms for the active interface language', () => {
  assert.equal(languageName('zh-CN'), '简体中文');
  assert.equal(languageName('zh-TW'), '繁體中文');
  assert.equal(languageName('en'), 'English');
});
