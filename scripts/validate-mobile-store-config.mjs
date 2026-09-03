import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const mobileRoot = path.join(root, 'apps/mobile');
const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'eas.json'), 'utf8'));
const store = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'store.config.json'), 'utf8'));
const googlePlayRoot = path.join(mobileRoot, 'store/google-play');
const googlePlay = JSON.parse(fs.readFileSync(path.join(googlePlayRoot, 'listing.json'), 'utf8'));
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function resolveAsset(relativePath, label) {
  expect(typeof relativePath === 'string' && relativePath.length > 0, `${label} is missing`);
  if (!relativePath) return null;
  const absolutePath = path.resolve(mobileRoot, relativePath);
  expect(fs.existsSync(absolutePath), `${label} does not exist: ${relativePath}`);
  return fs.existsSync(absolutePath) ? absolutePath : null;
}

function pngDimensions(filePath) {
  const data = fs.readFileSync(filePath);
  const signature = '89504e470d0a1a0a';
  expect(data.subarray(0, 8).toString('hex') === signature, `${path.relative(root, filePath)} is not a PNG`);
  if (data.length < 24) return null;
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25],
    hasTransparencyChunk: data.includes(Buffer.from('tRNS'))
  };
}

function readListingText(relativePath) {
  const filePath = path.join(googlePlayRoot, relativePath);
  expect(fs.existsSync(filePath), `Google Play listing file does not exist: ${relativePath}`);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').trim() : '';
}

expect(app.name === '唐人日报', 'expo.name must remain 唐人日报');
expect(/^\d+\.\d+\.\d+$/.test(app.version ?? ''), 'expo.version must use semantic x.y.z format');
expect(app.ios?.bundleIdentifier === 'net.trrb.mobile', 'iOS bundleIdentifier must be net.trrb.mobile');
expect(/^\d+$/.test(app.ios?.buildNumber ?? ''), 'iOS buildNumber must be a numeric string');
expect(Number.isInteger(app.android?.versionCode) && app.android.versionCode > 0, 'Android versionCode must be a positive integer');
expect(app.android?.package === 'net.trrb.mobile', 'Android package must be net.trrb.mobile');
expect(app.runtimeVersion?.policy === 'appVersion', 'OTA runtimeVersion must follow appVersion');
expect(/^https:\/\/u\.expo\.dev\/[0-9a-f-]{36}$/.test(app.updates?.url ?? ''), 'Expo Updates URL is invalid');
expect(/^[0-9a-f-]{36}$/.test(app.extra?.eas?.projectId ?? ''), 'EAS projectId is invalid');
expect(eas.cli?.appVersionSource === 'local', 'EAS appVersionSource must be local');
expect(eas.build?.production?.channel === 'production', 'Production build must use the production update channel');
expect(eas.build?.production?.autoIncrement === true, 'Production build must auto-increment native build versions');

const privacy = app.ios?.privacyManifests;
expect(privacy?.NSPrivacyTracking === false, 'iOS privacy manifest must explicitly disable tracking');
expect(Array.isArray(privacy?.NSPrivacyTrackingDomains) && privacy.NSPrivacyTrackingDomains.length === 0, 'Tracking domains must remain empty');
const requiredReasons = new Map((privacy?.NSPrivacyAccessedAPITypes ?? []).map((item) => [
  item.NSPrivacyAccessedAPIType,
  new Set(item.NSPrivacyAccessedAPITypeReasons ?? [])
]));
for (const [api, reasons] of Object.entries({
  NSPrivacyAccessedAPICategoryFileTimestamp: ['0A2A.1', '3B52.1', 'C617.1'],
  NSPrivacyAccessedAPICategoryDiskSpace: ['85F4.1', 'E174.1'],
  NSPrivacyAccessedAPICategorySystemBootTime: ['35F9.1'],
  NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1']
})) {
  for (const reason of reasons) expect(requiredReasons.get(api)?.has(reason), `Missing iOS required-reason declaration: ${api} ${reason}`);
}

expect(store.configVersion === 0, 'EAS Metadata configVersion must be 0');
expect(store.apple?.categories?.[0] === 'NEWS', 'App Store primary category must be NEWS');
const listing = store.apple?.info?.['zh-Hans'];
expect(listing?.title === app.name, 'Simplified Chinese store title must match the installed app name');
expect(listing?.title?.length >= 2 && listing.title.length <= 30, 'Store title must contain 2-30 characters');
expect(listing?.subtitle?.length > 0 && listing.subtitle.length <= 30, 'Store subtitle must contain at most 30 characters');
expect(listing?.description?.length >= 10 && listing.description.length <= 4000, 'Store description must contain 10-4000 characters');
expect(listing?.promoText?.length > 0 && listing.promoText.length <= 170, 'Store promo text must contain at most 170 characters');
expect(Array.isArray(listing?.keywords) && new Set(listing.keywords).size === listing.keywords.length, 'Store keywords must be unique');
expect((listing?.keywords ?? []).join(',').length <= 100, 'Combined App Store keywords must not exceed 100 characters');
for (const field of ['marketingUrl', 'supportUrl', 'privacyPolicyUrl', 'privacyChoicesUrl']) {
  expect(/^https:\/\//.test(listing?.[field] ?? ''), `${field} must be an HTTPS URL`);
}
expect(listing?.privacyPolicyUrl === 'https://trrb.net/privacy.html', 'Store privacy policy must use the published TRRB policy');
expect(listing?.privacyChoicesUrl === 'https://trrb.net/delete-account.html', 'Store privacy choices must point to account deletion instructions');

const googleTitle = readListingText('zh-CN/title.txt');
const googleShortDescription = readListingText('zh-CN/short-description.txt');
const googleFullDescription = readListingText('zh-CN/full-description.txt');
expect(googlePlay.packageName === app.android?.package, 'Google Play package name must match the installed Android package');
expect(googlePlay.defaultLanguage === 'zh-CN', 'Google Play default language must be zh-CN');
expect(googlePlay.category === 'NEWS_AND_MAGAZINES', 'Google Play category must be NEWS_AND_MAGAZINES');
expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(googlePlay.contactEmail ?? ''), 'Google Play contact email is invalid');
for (const field of ['website', 'privacyPolicyUrl', 'accountDeletionUrl']) {
  expect(/^https:\/\//.test(googlePlay[field] ?? ''), `Google Play ${field} must be an HTTPS URL`);
}
expect(googlePlay.privacyPolicyUrl === listing?.privacyPolicyUrl, 'Google Play and App Store must use the same privacy policy');
expect(googlePlay.accountDeletionUrl === listing?.privacyChoicesUrl, 'Google Play and App Store must use the same account deletion instructions');
expect(googleTitle === app.name, 'Google Play title must match the installed app name');
expect(googleTitle.length >= 2 && googleTitle.length <= 30, 'Google Play title must contain 2-30 characters');
expect(googleShortDescription.length >= 10 && googleShortDescription.length <= 80, 'Google Play short description must contain 10-80 characters');
expect(googleFullDescription.length >= 80 && googleFullDescription.length <= 4000, 'Google Play full description must contain 80-4000 characters');

const screenshotNames = googlePlay.phoneScreenshots;
expect(Array.isArray(screenshotNames) && screenshotNames.length >= 2 && screenshotNames.length <= 8, 'Google Play must define 2-8 phone screenshots');
expect(new Set(screenshotNames ?? []).size === (screenshotNames ?? []).length, 'Google Play screenshot names must be unique');
const screenshotFlowPath = path.join(mobileRoot, '.maestro/store-screenshots.yml');
expect(fs.existsSync(screenshotFlowPath), 'Google Play Maestro screenshot flow is missing');
const screenshotFlow = fs.existsSync(screenshotFlowPath) ? fs.readFileSync(screenshotFlowPath, 'utf8') : '';
for (const screenshotName of screenshotNames ?? []) {
  expect(screenshotFlow.includes(`store/google-play/screenshots/phone/${screenshotName}`), `Maestro flow must capture Google Play screenshot: ${screenshotName}`);
}
expect((screenshotFlow.match(/takeScreenshot:/g) ?? []).length === (screenshotNames ?? []).length, 'Maestro screenshot count must match the Google Play manifest');

for (const [relativePath, label, exactSize] of [
  [app.icon, 'App icon', 1024],
  [app.android?.adaptiveIcon?.foregroundImage, 'Android adaptive icon', 1024]
]) {
  const filePath = resolveAsset(relativePath, label);
  if (!filePath) continue;
  const dimensions = pngDimensions(filePath);
  if (!dimensions) continue;
  expect(dimensions.width === dimensions.height, `${label} must be square`);
  expect(dimensions.width === exactSize, `${label} must be exactly ${exactSize}x${exactSize}`);
  expect(![4, 6].includes(dimensions.colorType) && !dimensions.hasTransparencyChunk, `${label} must not contain an alpha channel or transparency chunk`);
}

if (failures.length) {
  console.error(`Mobile store configuration failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Mobile store configuration: PASS');
