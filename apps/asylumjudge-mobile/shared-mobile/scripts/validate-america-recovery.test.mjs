import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const tab = await readFile(new URL('../app/(tabs)/america.tsx', import.meta.url), 'utf8');
const portal = await readFile(new URL('../src/components/WebPortalScreen.tsx', import.meta.url), 'utf8');

test('replaces the former U.S. news tab with the canonical PC community portal', () => {
  assert.match(tab, /https:\/\/trrb\.net\/community\/\?app=1/);
  assert.match(tab, /testID="screen-america"/);
  assert.match(tab, /webViewTestID="community-portal-webview"/);
  assert.match(tab, /SESSION_STORAGE_KEY/);
  assert.doesNotMatch(tab, /fetchArticlePage|美国时政|U\.S\. politics/);
});

test('shares the native account session and keeps accessible portal recovery', () => {
  assert.match(tab, /supabase\.auth\.getSession/);
  assert.match(tab, /injectedJavaScriptBeforeContentLoaded/);
  assert.match(portal, /onShouldStartLoadWithRequest/);
  assert.match(portal, /AccessibilityInfo\.announceForAccessibility/);
  assert.match(portal, /accessibilityRole="link"/);
  assert.match(portal, /minHeight:44/);
});
