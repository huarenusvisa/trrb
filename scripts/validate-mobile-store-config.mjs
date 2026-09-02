import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const mobileRoot = path.join(root, 'apps/mobile');
const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'eas.json'), 'utf8'));
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
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
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

for (const [relativePath, label] of [
  [app.icon, 'App icon'],
  [app.android?.adaptiveIcon?.foregroundImage, 'Android adaptive icon']
]) {
  const filePath = resolveAsset(relativePath, label);
  if (!filePath) continue;
  const dimensions = pngDimensions(filePath);
  if (!dimensions) continue;
  expect(dimensions.width === dimensions.height, `${label} must be square`);
  expect(dimensions.width >= 512, `${label} must be at least 512x512`);
}

if (failures.length) {
  console.error(`Mobile store configuration failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Mobile store configuration: PASS');
