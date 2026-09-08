import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'store/review-access.json'), 'utf8'));
const apple = fs.readFileSync(path.join(mobileRoot, 'store/review/apple-review-notes-en.txt'), 'utf8');
const google = fs.readFileSync(path.join(mobileRoot, 'store/review/google-app-access-en.txt'), 'utf8');

test('store review access manifest covers guest and protected features', () => {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.status, 'ready-for-console-credentials');
  assert.equal(manifest.authentication.guestBrowsingAvailable, true);
  assert.equal(manifest.authentication.reviewAccount.storage, 'apple-and-google-store-consoles-only');
  assert.equal(manifest.authentication.reviewAccount.repositoryAllowed, false);
  assert.equal(manifest.authentication.reviewAccount.mustNotExpire, true);
  assert.equal(manifest.authentication.reviewAccount.requiresOtpOrMfa, false);
  assert.deepEqual(manifest.reviewFlows.map(({ id }) => id), [
    'guest-news', 'unified-account', 'community-and-comments', 'cloud-library',
    'push-notifications', 'account-deletion'
  ]);
});

test('review instructions are complete and credentials remain console-only', () => {
  for (const [platform, copy] of [['Apple', apple], ['Google', google]]) {
    assert.match(copy, /without sign(?:ing)? in/i, `${platform} must explain guest access`);
    assert.match(copy, /non-expiring review account/i, `${platform} must require durable access`);
    assert.match(copy, /No OTP, MFA/i, `${platform} must explain authentication barriers`);
    assert.match(copy, /Community/i);
    assert.match(copy, /News comments/i);
    assert.match(copy, /Favorites/i);
    assert.match(copy, /Push/i);
    assert.match(copy, /Account deletion/i);
    assert.match(copy, /\[ENTER ONLY IN [A-Z ]+\]/);
    assert.doesNotMatch(copy, /(?:password|username):\s*(?!\[ENTER ONLY)[^\s[]+/i, `${platform} copy contains a credential-like value`);
  }
});

test('every review flow cites code that exists and key controls remain testable', () => {
  for (const flow of manifest.reviewFlows) {
    for (const evidence of flow.evidence) {
      const [relativeFile, marker] = evidence.split('#');
      const source = fs.readFileSync(path.join(mobileRoot, relativeFile), 'utf8');
      if (marker) assert.ok(source.includes(`testID=\"${marker}\"`), `Missing ${marker} in ${relativeFile}`);
    }
  }
  const auth = fs.readFileSync(path.join(mobileRoot, 'app/auth.tsx'), 'utf8');
  const deletion = fs.readFileSync(path.join(mobileRoot, 'app/delete-account.tsx'), 'utf8');
  assert.match(auth, /loginOrRegister\(identifier, password\)/);
  assert.match(deletion, /confirm\.trim\(\) !== 'DELETE'/);
});

test('review materials never contain common committed secret formats', () => {
  const combined = [JSON.stringify(manifest), apple, google].join('\n');
  assert.doesNotMatch(combined, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'JWT-like credential found');
  assert.doesNotMatch(combined, /(?:sk|sbp|EAS)[_-][A-Za-z0-9_-]{20,}/, 'API token-like credential found');
  assert.doesNotMatch(combined, /-----BEGIN (?:PRIVATE|RSA|EC) KEY-----/, 'private key found');
});
