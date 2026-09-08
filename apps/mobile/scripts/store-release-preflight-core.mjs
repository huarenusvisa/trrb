import fs from 'node:fs';
import path from 'node:path';

const CONFIRMED = '1';

function isNumericAppleId(value) {
  return /^\d{6,20}$/.test(value ?? '');
}

export function inspectReleaseReadiness({ mobileRoot, env = {} }) {
  const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8'));
  const eas = readJson('eas.json');
  const app = readJson('app.json').expo;
  const readiness = readJson('store/release-readiness.json');
  const failures = [];

  const expect = (condition, message) => {
    if (!condition) failures.push(message);
  };

  expect(readiness.schemaVersion === 1, 'Release-readiness schemaVersion must be 1');
  expect(readiness.releaseLane === 'internal-testing', 'First store release lane must remain internal testing');
  expect(readiness.codeStatus === 'ready', 'Release code status must be ready');
  expect(eas.build?.production?.distribution == null, 'Production builds must use store distribution');
  expect(eas.build?.production?.credentialsSource === 'remote', 'Production signing credentials must be remotely managed by EAS');
  expect(eas.build?.production?.android?.buildType === 'app-bundle', 'Android production build must produce an AAB');
  expect(eas.build?.production?.ios?.simulator !== true, 'iOS production build must target physical devices and App Store distribution');
  expect(eas.submit?.production?.android?.track === 'internal', 'Android first submission must target the internal track');
  expect(eas.submit?.production?.android?.releaseStatus === 'draft', 'Android first submission must remain a draft');
  expect(eas.submit?.production?.ios == null, 'Do not commit an iOS submit profile before the real numeric App Store Connect app ID is known');
  expect(app.ios?.bundleIdentifier === app.android?.package, 'iOS and Android production identifiers must remain aligned');
  expect(readiness.submissionSafety?.automaticProductionRelease === false, 'Automatic public store release must remain disabled');
  expect(readiness.submissionSafety?.credentialsCommittedToRepository === false, 'Release manifest must forbid committed credentials');

  const requirements = readiness.externalRequirements ?? [];
  const ids = requirements.map((item) => item.id);
  expect(new Set(ids).size === ids.length, 'External requirement IDs must be unique');
  const expectedIds = [
    'expo_access_token',
    'apple_asc_app_id',
    'apple_distribution_credentials',
    'google_play_service_account',
    'store_screenshots',
    'store_console_forms'
  ];
  expect(JSON.stringify(ids) === JSON.stringify(expectedIds), 'External release requirements are incomplete or out of order');

  const missing = requirements.filter((requirement) => {
    const value = env[requirement.confirmationEnvironmentVariable];
    return requirement.id === 'apple_asc_app_id' ? !isNumericAppleId(value) : value !== CONFIRMED;
  }).map(({ id, label, confirmationEnvironmentVariable }) => ({ id, label, confirmationEnvironmentVariable }));

  return {
    codeReady: failures.length === 0,
    failures,
    externalReady: missing.length === 0,
    missing,
    releaseLane: readiness.releaseLane
  };
}
