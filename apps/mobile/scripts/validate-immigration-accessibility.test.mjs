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
  assert.match(tab, /https:\/\/huarengongzuo\.com\//);
  assert.doesNotMatch(tab, /trrb\.net\/immigrate|ImmigrationScreen|pathways/);
});

test('keeps the jobs tab on the canonical public feed with accessible recovery', () => {
  assert.match(tab, /Linking\.canOpenURL\(JOBS_PORTAL_URL\)[\s\S]*Linking\.openURL\(JOBS_PORTAL_URL\)/);
  assert.match(tab, /testID="jobs-portal-link-error"[\s\S]*accessibilityRole="alert"/);
  assert.match(tab, /testID="jobs-portal-link-retry"/);
  assert.match(jobs, /\.netlify\/functions\/public-jobs\?limit=40/);
  assert.match(jobs, /readCachedJobs/);
  assert.match(jobs, /cacheJobs/);
  assert.match(jobs, /AccessibilityInfo\.announceForAccessibility/);
  assert.match(jobs, /accessibilityRole="link"/);
  assert.match(jobs, /minHeight: 48/);
});
