import fs from 'node:fs';
import path from 'node:path';

const BUILD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMIT_SHA = /^[0-9a-f]{40}$/i;
const ALLOWED_ROOT_KEYS = ['schemaVersion', 'sourceCommit', 'application', 'builds'];
const ALLOWED_APPLICATION_KEYS = ['slug', 'projectId', 'version', 'runtimeVersion', 'ios', 'android'];
const ALLOWED_IOS_KEYS = ['bundleIdentifier'];
const ALLOWED_ANDROID_KEYS = ['package'];
const ALLOWED_BUILD_KEYS = [
  'platform', 'easBuildId', 'profile', 'status', 'distribution', 'channel',
  'artifactType', 'sourceCommit', 'appVersion', 'runtimeVersion', 'nativeBuildVersion',
  'createdAt', 'completedAt'
];

function sameKeys(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.includes(key));
}

function validIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

export function inspectBuildEvidence({ mobileRoot, evidence, expectedSourceCommit }) {
  const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo;
  const failures = [];
  const expect = (condition, message) => { if (!condition) failures.push(message); };

  expect(sameKeys(evidence, ALLOWED_ROOT_KEYS), 'Build evidence contains unsupported root fields');
  expect(evidence?.schemaVersion === 1, 'Build evidence schemaVersion must be 1');
  expect(COMMIT_SHA.test(evidence?.sourceCommit ?? ''), 'Build evidence sourceCommit must be a full Git commit SHA');
  if (expectedSourceCommit) {
    expect(evidence?.sourceCommit === expectedSourceCommit, 'Build evidence does not belong to the checked-out Git commit');
  }

  const application = evidence?.application;
  expect(sameKeys(application, ALLOWED_APPLICATION_KEYS), 'Build evidence application contains unsupported fields');
  expect(application?.slug === app.slug, 'Build evidence Expo slug does not match app.json');
  expect(application?.projectId === app.extra?.eas?.projectId, 'Build evidence EAS project does not match app.json');
  expect(application?.version === app.version, 'Build evidence app version does not match app.json');
  expect(application?.runtimeVersion === app.version, 'Build evidence runtime version must match the app-version policy');
  expect(sameKeys(application?.ios, ALLOWED_IOS_KEYS), 'Build evidence iOS application contains unsupported fields');
  expect(application?.ios?.bundleIdentifier === app.ios?.bundleIdentifier, 'Build evidence iOS bundle identifier does not match app.json');
  expect(sameKeys(application?.android, ALLOWED_ANDROID_KEYS), 'Build evidence Android application contains unsupported fields');
  expect(application?.android?.package === app.android?.package, 'Build evidence Android package does not match app.json');

  const builds = Array.isArray(evidence?.builds) ? evidence.builds : [];
  expect(builds.length === 2, 'Build evidence must contain exactly one iOS and one Android build');
  const byPlatform = Object.fromEntries(builds.map((build) => [build?.platform, build]));
  expect(new Set(builds.map((build) => build?.platform)).size === builds.length, 'Build evidence contains duplicate platforms');

  for (const platform of ['ios', 'android']) {
    const build = byPlatform[platform];
    expect(Boolean(build), `Build evidence is missing the ${platform} build`);
    if (!build) continue;
    expect(sameKeys(build, ALLOWED_BUILD_KEYS), `${platform} build contains unsupported or sensitive fields`);
    expect(BUILD_ID.test(build.easBuildId ?? ''), `${platform} EAS build ID must be a UUID`);
    expect(build.profile === 'production', `${platform} build must use the production profile`);
    expect(build.status === 'finished', `${platform} build must be finished`);
    expect(build.distribution === 'store', `${platform} build must use store distribution`);
    expect(build.channel === 'production', `${platform} build must use the production update channel`);
    expect(build.artifactType === (platform === 'ios' ? 'ipa' : 'aab'), `${platform} build has the wrong artifact type`);
    expect(build.sourceCommit === evidence.sourceCommit, `${platform} build source commit does not match the evidence release commit`);
    expect(build.appVersion === app.version, `${platform} build app version does not match app.json`);
    expect(build.runtimeVersion === app.version, `${platform} build runtime version does not match app.json`);
    expect(/^\d+$/.test(build.nativeBuildVersion ?? '') && Number(build.nativeBuildVersion) > 0, `${platform} native build version must be a positive integer`);
    expect(validIsoDate(build.createdAt), `${platform} build createdAt must be an ISO timestamp`);
    expect(validIsoDate(build.completedAt), `${platform} build completedAt must be an ISO timestamp`);
    if (validIsoDate(build.createdAt) && validIsoDate(build.completedAt)) {
      expect(Date.parse(build.completedAt) >= Date.parse(build.createdAt), `${platform} build completedAt precedes createdAt`);
    }
  }

  return { valid: failures.length === 0, failures };
}

export function readBuildEvidence({ mobileRoot, evidencePath, expectedSourceCommit }) {
  try {
    const absolutePath = path.isAbsolute(evidencePath) ? evidencePath : path.resolve(mobileRoot, evidencePath);
    const evidence = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    return inspectBuildEvidence({ mobileRoot, evidence, expectedSourceCommit });
  } catch {
    return { valid: false, failures: ['Unable to read or parse the local build evidence file'] };
  }
}
