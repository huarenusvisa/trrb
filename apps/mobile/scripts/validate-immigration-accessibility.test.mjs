import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const tab = await readFile(new URL('../app/(tabs)/immigration.tsx', import.meta.url), 'utf8');
const jobs = await readFile(new URL('../app/jobs.tsx', import.meta.url), 'utf8');

test('replaces the former immigration directory with the existing jobs screen', () => {
  assert.match(tab, /import JobsScreen from '\.\.\/jobs'/);
  assert.match(tab, /testID="screen-immigration"/);
  assert.match(tab, /<JobsScreen embedded \/>/);
  assert.match(jobs, /!embedded \? <Stack\.Screen/);
  assert.doesNotMatch(tab, /huarengongzuo|trrb\.net\/immigrate|ImmigrationScreen|pathways/i);
});

test('keeps the jobs tab on the canonical public feed with accessible recovery', () => {
  assert.match(jobs, /\.netlify\/functions\/public-jobs/);
  assert.match(jobs, /testID="jobs-search-input"/);
  assert.match(jobs, /testID="jobs-search-submit"/);
  assert.match(jobs, /testID="jobs-load-more"/);
  assert.match(jobs, /encodeURIComponent\(query\)/);
  assert.match(jobs, /nextOffset/);
  assert.match(jobs, /readCachedJobs/);
  assert.match(jobs, /cacheJobs/);
  assert.match(jobs, /AccessibilityInfo\.announceForAccessibility/);
  assert.match(jobs, /accessibilityRole="link"/);
  assert.match(jobs, /minHeight:\s*48/);
});
