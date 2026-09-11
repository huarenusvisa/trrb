import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function readPngInfo(filePath) {
  const data = fs.readFileSync(filePath);
  if (data.length < 26 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    return { error: 'must be a PNG file' };
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25],
    hasTransparency: data.includes(Buffer.from('tRNS')),
    digest: crypto.createHash('sha256').update(data).digest('hex')
  };
}

function sameNames(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function validateScreenshotSet({ mobileRoot, screens, directory, acceptedPortraitSizes, playRules, label }) {
  const failures = [];
  const digests = new Set();

  for (const screen of screens) {
    const relativePath = path.join(directory, `${screen}.png`);
    const filePath = path.join(mobileRoot, relativePath);
    if (!fs.existsSync(filePath)) {
      failures.push(`${label} screenshot is missing: ${relativePath}`);
      continue;
    }

    const info = readPngInfo(filePath);
    if (info.error) {
      failures.push(`${label} ${relativePath} ${info.error}`);
      continue;
    }
    if ([4, 6].includes(info.colorType) || info.hasTransparency) {
      failures.push(`${label} ${relativePath} must not contain alpha or transparency`);
    }
    if (info.width >= info.height) failures.push(`${label} ${relativePath} must use portrait orientation`);

    if (acceptedPortraitSizes) {
      const accepted = acceptedPortraitSizes.some(([width, height]) => info.width === width && info.height === height);
      if (!accepted) failures.push(`${label} ${relativePath} has unsupported dimensions ${info.width}x${info.height}`);
    }

    if (playRules) {
      const minimum = Math.min(info.width, info.height);
      const maximum = Math.max(info.width, info.height);
      if (minimum < playRules.minimumDimension || maximum > playRules.maximumDimension) {
        failures.push(`${label} ${relativePath} must keep both dimensions within ${playRules.minimumDimension}-${playRules.maximumDimension}px`);
      }
      if (maximum / minimum > playRules.maximumAspectRatio) {
        failures.push(`${label} ${relativePath} exceeds the ${playRules.maximumAspectRatio}:1 aspect ratio`);
      }
    }

    if (digests.has(info.digest)) failures.push(`${label} ${relativePath} duplicates another screenshot`);
    digests.add(info.digest);
  }

  return failures;
}

export function validateStoreSubmissionAssets(mobileRoot) {
  const manifest = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'store/submission-assets.json'), 'utf8'));
  const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo;
  const playListing = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'store/google-play/listing.json'), 'utf8'));
  const failures = [];
  const screens = manifest.screens ?? [];

  if (screens.length < 1 || screens.length > 10 || new Set(screens).size !== screens.length) {
    failures.push('Submission screenshot manifest must define 1-10 unique screens');
  }
  if (!sameNames(playListing.phoneScreenshots ?? [], screens)) {
    failures.push('Google Play screenshot order must match the shared submission screenshot manifest');
  }
  if (app.ios?.supportsTablet && !manifest.appStore?.ipad13) {
    failures.push('The 13-inch iPad screenshot set is required while ios.supportsTablet is enabled');
  }

  for (const [key, value] of Object.entries(manifest.appStore ?? {})) {
    failures.push(...validateScreenshotSet({
      mobileRoot,
      screens,
      directory: value.directory,
      acceptedPortraitSizes: value.acceptedPortraitSizes,
      label: `App Store ${key}`
    }));
  }
  failures.push(...validateScreenshotSet({
    mobileRoot,
    screens,
    directory: manifest.googlePlay.directory,
    playRules: manifest.googlePlay,
    label: 'Google Play phone'
  }));

  return failures;
}
