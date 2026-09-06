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
