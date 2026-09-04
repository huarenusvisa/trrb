import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const nativeWorkflow = read('apps/mobile/.eas/workflows/auto-e2e-regression.yml');
const otaWorkflow = read('apps/mobile/.eas/workflows/publish-preview-ota.yml');
const netlifyConfig = read('netlify.toml');
const netlifyIgnore = read('scripts/netlify-ignore-build.sh');

test('native E2E builds only run for native-impacting changes or manual dispatch', () => {
  assert.match(nativeWorkflow, /workflow_dispatch:\s*\{\}/);
  assert.match(nativeWorkflow, /apps\/mobile\/app\.json/);
  assert.match(nativeWorkflow, /apps\/mobile\/eas\.json/);
  assert.match(nativeWorkflow, /apps\/mobile\/package-lock\.json/);
  assert.doesNotMatch(nativeWorkflow, /^\s*- 'apps\/mobile\/package\.json'$/m, 'script-only package.json changes must not trigger native builds');
  assert.match(nativeWorkflow, /apps\/mobile\/assets\/app-icon-1024\.png/);
  assert.match(nativeWorkflow, /concurrency:[\s\S]*cancel_in_progress:\s*true/);
  assert.match(nativeWorkflow, /group:\s*\$\{\{ workflow\.filename \}\}-\$\{\{ github\.ref \}\}/);

  for (const broadPath of [
    'apps/mobile/app/**',
    'apps/mobile/src/**',
    'apps/mobile/assets/**',
    'apps/mobile/.maestro/**',
  ]) {
    assert.equal(nativeWorkflow.includes(`- '${broadPath}'`), false, `${broadPath} must not trigger native builds`);
  }
});

test('ordinary app code publishes OTA while test-only and icon-only changes do not', () => {
  assert.match(otaWorkflow, /apps\/mobile\/app\/\*\*/);
  assert.match(otaWorkflow, /apps\/mobile\/src\/\*\*/);
  assert.match(otaWorkflow, /apps\/mobile\/assets\/\*\*/);
  assert.match(otaWorkflow, /!apps\/mobile\/src\/\*\*\/\*\.test\.ts/);
  assert.match(otaWorkflow, /!apps\/mobile\/assets\/app-icon-1024\.png/);
  assert.match(otaWorkflow, /concurrency:[\s\S]*cancel_in_progress:\s*true/);
  assert.match(otaWorkflow, /group:\s*\$\{\{ workflow\.filename \}\}-\$\{\{ github\.ref \}\}/);
});

test('Netlify preserves previews and skips production for mobile-only commits', () => {
  assert.match(netlifyConfig, /ignore\s*=\s*"bash scripts\/netlify-ignore-build\.sh"/);
  assert.match(netlifyIgnore, /CONTEXT:-.*production/);
  assert.match(netlifyIgnore, /pathspecs\+=\(":\(exclude\)apps\/mobile\/\*\*"\)/);

  const contextGuard = netlifyIgnore.indexOf('if [[ "${CONTEXT:-}" == "production" ]]');
  const mobileExclusion = netlifyIgnore.indexOf(':(exclude)apps/mobile/**');
  assert.ok(contextGuard >= 0 && mobileExclusion > contextGuard, 'mobile exclusion must be production-only');
});
