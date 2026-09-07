const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const { normalizePushTokenClaim } = require('./push-token-registration-core');

test('normalizes supported native platforms and Expo token formats', () => {
  assert.deepEqual(normalizePushTokenClaim({
    platform: ' IOS ',
    expo_push_token: ' ExpoPushToken[abcdefghijklmnop] '
  }), { platform: 'ios', expoPushToken: 'ExpoPushToken[abcdefghijklmnop]' });
  assert.equal(normalizePushTokenClaim({
    platform: 'android',
    expo_push_token: 'ExponentPushToken[abcdefghijklmnop]'
  }).platform, 'android');
});

test('rejects web, malformed and oversized token claims', () => {
  assert.throws(() => normalizePushTokenClaim({ platform: 'web', expo_push_token: 'ExpoPushToken[abcdefghijklmnop]' }), /平台/);
  assert.throws(() => normalizePushTokenClaim({ platform: 'ios', expo_push_token: 'not-a-token' }), /Token/);
  assert.throws(() => normalizePushTokenClaim({ platform: 'ios', expo_push_token: `ExpoPushToken[${'x'.repeat(513)}]` }), /Token/);
});

test('endpoint derives ownership from authenticated bearer identity', () => {
  const endpoint = fs.readFileSync('netlify/functions/push-token-registration.js', 'utf8');
  assert.match(endpoint, /await authenticateUser\(event\)/);
  assert.match(endpoint, /p_user_id:\s*user\.id/);
  assert.match(endpoint, /rpc\/claim_mobile_push_token/);
  assert.doesNotMatch(endpoint, /body\.user_id/);
});

test('database claim is serialized and executable only by service role', () => {
  const migration = fs.readFileSync('supabase/migrations/20260907122247_claim_mobile_push_token.sql', 'utf8');
  assert.match(migration, /security invoker/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /user_id <> p_user_id/);
  assert.match(migration, /on conflict \(user_id, expo_push_token\) do update/i);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
});
