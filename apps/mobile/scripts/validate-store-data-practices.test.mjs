import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const root = path.resolve(mobileRoot, '../..');
const practices = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'store/data-practices.json'), 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo;
const store = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'store.config.json'), 'utf8'));
const play = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'store/google-play/listing.json'), 'utf8'));
const packageJson = fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8');
const privacyPolicy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');

const requiredIds = [
  'email_address', 'phone_number', 'user_id', 'name', 'other_user_content',
  'photos', 'videos', 'direct_messages', 'app_interactions', 'device_identifier',
  'network_identifier', 'diagnostics',
];
const requiredCollectionIds = new Set(['app_interactions', 'network_identifier', 'diagnostics']);

test('store data worksheet covers every current mobile data flow', () => {
  assert.equal(practices.schemaVersion, 1);
  assert.equal(practices.status, 'ready_for_console_confirmation');
  assert.deepEqual(practices.dataTypes.map((item) => item.id).sort(), requiredIds.sort());
  assert.equal(new Set(practices.dataTypes.map((item) => item.id)).size, practices.dataTypes.length);

  for (const item of practices.dataTypes) {
    assert.equal(item.optional, !requiredCollectionIds.has(item.id), `${item.id} required/optional answer changed`);
    assert.equal(item.linkedToUser, true, `${item.id} is stored against an account or device`);
    assert.equal(item.usedForTracking, false, `${item.id} must not be used for tracking`);
    assert.ok(item.apple.category && item.apple.type && item.apple.purposes.length, `${item.id} needs an Apple mapping`);
    assert.ok(item.googlePlay.category && item.googlePlay.type && item.googlePlay.purposes.length, `${item.id} needs a Google Play mapping`);
    for (const relativePath of item.evidence) {
      assert.ok(fs.existsSync(path.join(mobileRoot, relativePath)), `${item.id} evidence is missing: ${relativePath}`);
    }
  }
});

test('tracking, sharing, security and deletion answers match app and store configuration', () => {
  assert.equal(practices.tracking, false);
  assert.equal(practices.thirdPartyAdvertising, false);
  assert.equal(practices.analyticsSdk, false);
  assert.equal(practices.dataShared, false);
  assert.match(practices.dataSharingRationale, /service|processors/i);
  assert.equal(practices.dataEncryptedInTransit, true);
  assert.equal(app.ios.privacyManifests.NSPrivacyTracking, practices.tracking);
  assert.deepEqual(app.ios.privacyManifests.NSPrivacyTrackingDomains, []);
  assert.doesNotMatch(packageJson, /facebook|appsflyer|adjust|firebase-analytics|google-mobile-ads/i);

  const appleListing = store.apple.info['zh-Hans'];
  assert.equal(practices.privacyPolicyUrl, appleListing.privacyPolicyUrl);
  assert.equal(practices.privacyPolicyUrl, play.privacyPolicyUrl);
  assert.equal(practices.accountDeletion.availableInApp, true);
  assert.equal(practices.accountDeletion.webUrl, appleListing.privacyChoicesUrl);
  assert.equal(practices.accountDeletion.webUrl, play.accountDeletionUrl);
});

test('worksheet evidence reflects implemented account, social, library and push features', () => {
  const evidenceChecks = [
    ['src/auth/unified-account.ts', /type: 'email' \| 'phone'/],
    ['app/profile-settings.tsx', /display_name/],
    ['app/community-compose.tsx', /createCommunityPost/],
    ['src/components/CommentThread.tsx', /createComment/],
    ['src/social/posts.ts', /uploadPickedAsset/],
    ['src/social/messages.ts', /direct_messages/],
    ['src/storage/library.ts', /reading_history/],
    ['src/storage/library.ts', /favorites/],
    ['src/push/registration-api.ts', /push-token-registration/],
  ];
  for (const [relativePath, pattern] of evidenceChecks) {
    assert.match(fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8'), pattern, `${relativePath} no longer proves its disclosure`);
  }
});

test('published privacy policy describes the mobile disclosures and deletion controls', () => {
  assert.match(privacyPolicy, /唐人日报网站和移动 App/);
  assert.match(privacyPolicy, /邮箱或手机号/);
  assert.match(privacyPolicy, /头像、封面、图片或视频/);
  assert.match(privacyPolicy, /收藏和阅读历史/);
  assert.match(privacyPolicy, /推送令牌/);
  assert.match(privacyPolicy, /App 内永久删除账户/);
  assert.match(privacyPolicy, /Tang Ren Daily website and mobile app/);
});

test('privacy policy, support and terms are accessible inside the app for guests and members', () => {
  const profile = fs.readFileSync(path.join(mobileRoot, 'app/(tabs)/profile.tsx'), 'utf8');
  assert.match(profile, /testID="profile-support"[\s\S]*https:\/\/trrb\.net\/app-support\.html/);
  assert.match(profile, /testID="profile-privacy"[\s\S]*https:\/\/trrb\.net\/privacy\.html/);
  assert.match(profile, /testID="profile-terms"[\s\S]*https:\/\/trrb\.net\/terms\.html/);
  assert.ok(profile.indexOf('profile-support') > profile.indexOf('</> : <>'), 'guest users must be able to reach policy links');
});
