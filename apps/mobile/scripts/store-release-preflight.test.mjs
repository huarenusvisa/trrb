import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { inspectReleaseReadiness } from './store-release-preflight-core.mjs';

const mobileRoot = path.resolve(import.meta.dirname, '..');

test('production builds and Android submission remain store-safe', () => {
  const result = inspectReleaseReadiness({ mobileRoot, env: {} });
  assert.equal(result.codeReady, true, result.failures.join('\n'));
  assert.equal(result.releaseLane, 'internal-testing');
  assert.equal(result.externalReady, false);
});

test('strict external readiness requires every named confirmation', () => {
  const incomplete = inspectReleaseReadiness({ mobileRoot, env: {
    TRRB_EXPO_ACCESS_CONFIRMED: '1',
    TRRB_APPLE_ASC_APP_ID: 'not-a-number'
  } });
  assert.equal(incomplete.externalReady, false);
  assert.ok(incomplete.missing.some((item) => item.id === 'apple_asc_app_id'));

  const complete = inspectReleaseReadiness({ mobileRoot, env: {
    TRRB_EXPO_ACCESS_CONFIRMED: '1',
    TRRB_APPLE_ASC_APP_ID: '1234567890',
    TRRB_APPLE_CREDENTIALS_CONFIRMED: '1',
    TRRB_GOOGLE_PLAY_CREDENTIALS_CONFIRMED: '1',
    TRRB_STORE_SCREENSHOTS_CONFIRMED: '1',
    TRRB_STORE_FORMS_CONFIRMED: '1'
  } });
  assert.equal(complete.externalReady, true);
  assert.deepEqual(complete.missing, []);
});

test('repository ignores local signing credential files', () => {
  const root = path.resolve(mobileRoot, '../..');
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  for (const pattern of [
    'apps/mobile/.credentials/',
    'apps/mobile/credentials.json',
    'apps/mobile/**/*.p8',
    'apps/mobile/**/*service-account*.json'
  ]) assert.ok(ignore.includes(pattern), `Missing credential ignore rule: ${pattern}`);
});

test('release commands cannot publish directly to public store tracks', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'));
  const eas = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'eas.json'), 'utf8'));
  assert.equal(eas.submit.production.android.track, 'internal');
  assert.equal(eas.submit.production.android.releaseStatus, 'draft');
  assert.equal(eas.submit.production.ios, undefined);
  assert.ok(packageJson.scripts['store:release-preflight:strict'].includes('--strict'));
  assert.equal(JSON.stringify(packageJson.scripts).includes('--auto-submit'), false);
});

test('production native builds require an explicit manual workflow run', () => {
  const workflow = fs.readFileSync(path.join(mobileRoot, '.eas/workflows/store-production-builds.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:\s*\{\}/);
  assert.doesNotMatch(workflow, /\bpush:/);
  assert.match(workflow, /platform: ios[\s\S]*profile: production/);
  assert.match(workflow, /platform: android[\s\S]*profile: production/);
  assert.doesNotMatch(workflow, /type:\s*(submit|testflight)/);
});
