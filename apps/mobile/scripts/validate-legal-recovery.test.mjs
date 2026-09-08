import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../app/(tabs)/legal.tsx', import.meta.url), 'utf8');

test('replaces the legal-record directory with the asylum judge portal', () => {
  for (const destination of [
    'https://asylumjudge.com/',
    'https://asylumjudge.com/judge',
    'https://asylumjudge.com/courts',
    'https://asylumjudge.com/states',
    'https://asylumjudge.com/nationality',
  ]) assert.ok(source.includes(destination), `missing judge portal destination: ${destination}`);
  assert.match(source, /testID="screen-legal"/);
  assert.doesNotMatch(source, /unified-legal-authorities|readCachedLegalRecords|cacheLegalRecords/);
});

test('judge portal validates, guards and retries accessible external links', () => {
  assert.match(source, /const openingRef = useRef\(false\)/);
  assert.match(source, /if \(openingRef\.current\) return/);
  assert.match(source, /Linking\.canOpenURL\(url\)[\s\S]*Linking\.openURL\(url\)/);
  assert.match(source, /AccessibilityInfo\.announceForAccessibility/);
  assert.match(source, /testID="judge-portal-link-error"[\s\S]*accessibilityRole="alert"/);
  assert.match(source, /testID="judge-portal-link-retry"[\s\S]*onPress=\{\(\) => void openExternal\(failedLink\.url, failedLink\.label\)\}/);
  assert.match(source, /useWindowDimensions\(\)/);
  assert.match(source, /fontScale >= 1\.3/);
  assert.match(source, /retryButton: \{ minHeight: 44/);
  assert.match(source, /accessibilityRole="link"/);
});

const detailSource = await readFile(new URL('../app/legal/[id].tsx', import.meta.url), 'utf8');

test('legacy legal detail links remain recoverable for saved and deep-linked records', () => {
  assert.match(detailSource, /readCachedLegalRecords/);
  assert.match(detailSource, /readCachedLegalAnalyses/);
  assert.match(detailSource, /Promise\.allSettled/);
  assert.match(detailSource, /REQUEST_TIMEOUT_MS = 12_000/);
  assert.match(detailSource, /useForegroundRetry\(Boolean\(error\)/);
  assert.match(detailSource, /RefreshControl/);
});

test('legacy legal detail guards official-source and share actions', () => {
  assert.match(detailSource, /actionInFlight\.current/);
  assert.match(detailSource, /Linking\.canOpenURL\(url\)/);
  assert.match(detailSource, /await Linking\.openURL\(url\)/);
  assert.match(detailSource, /await Share\.share/);
  assert.match(detailSource, /testID="legal-action-error"/);
  assert.match(detailSource, /testID="legal-action-retry"/);
  assert.match(detailSource, /accessibilityState=\{\{ disabled: activeAction !== null, busy:/);
  assert.match(detailSource, /minHeight:44/);
});
