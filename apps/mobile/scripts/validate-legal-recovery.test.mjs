import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../app/(tabs)/legal.tsx', import.meta.url), 'utf8');

test('legal directory preserves cached records and recovers after connectivity returns', () => {
  assert.match(source, /readCachedLegalRecords/);
  assert.match(source, /cacheLegalRecords/);
  assert.match(source, /REQUEST_TIMEOUT_MS = 12_000/);
  assert.match(source, /useForegroundRetry\(Boolean\(error\)/);
  assert.match(source, /RefreshControl/);
});

test('legal directory supports accessible search, retry, and dynamic-height records', () => {
  assert.match(source, /accessibilityRole="alert"/);
  assert.match(source, /accessibilityLiveRegion="polite"/);
  assert.match(source, /minHeight:44/);
  assert.match(source, /flexShrink:1/);
  assert.doesNotMatch(source, /height:\s*\d+/);
});

const detailSource = await readFile(new URL('../app/legal/[id].tsx', import.meta.url), 'utf8');

test('legal detail restores records and analyses independently before refreshing', () => {
  assert.match(detailSource, /readCachedLegalRecords/);
  assert.match(detailSource, /readCachedLegalAnalyses/);
  assert.match(detailSource, /Promise\.allSettled/);
  assert.match(detailSource, /REQUEST_TIMEOUT_MS = 12_000/);
  assert.match(detailSource, /useForegroundRetry\(Boolean\(error\)/);
});

test('legal detail preserves content with pull retry and accessible actions', () => {
  assert.match(detailSource, /RefreshControl/);
  assert.match(detailSource, /accessibilityRole="alert"/);
  assert.match(detailSource, /accessibilityLabel={t\('news.retry'\)}/);
  assert.match(detailSource, /minHeight:48/);
  assert.doesNotMatch(detailSource, /height:\s*\d+/);
});
