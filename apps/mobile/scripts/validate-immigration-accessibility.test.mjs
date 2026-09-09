import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const tab = await readFile(new URL('../app/(tabs)/immigration.tsx', import.meta.url), 'utf8');
const portal = await readFile(new URL('../src/components/WebPortalScreen.tsx', import.meta.url), 'utf8');

test('replaces the former immigration directory with the canonical jobs portal', () => {
  assert.match(tab, /https:\/\/huarengongzuo\.com\//);
  assert.match(tab, /screenTestID="screen-immigration"/);
  assert.match(tab, /webViewTestID="jobs-portal-webview"/);
  assert.doesNotMatch(tab, /JobsScreen|trrb\.net\/immigrate|ImmigrationScreen|pathways/i);
});

test('keeps the jobs portal guarded with accessible recovery', () => {
  assert.match(portal, /onShouldStartLoadWithRequest/);
  assert.match(portal, /Linking\.canOpenURL/);
  assert.match(portal, /AccessibilityInfo\.announceForAccessibility/);
  assert.match(portal, /accessibilityRole="link"/);
  assert.match(portal, /minHeight:44/);
});
