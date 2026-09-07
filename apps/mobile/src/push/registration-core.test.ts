import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseStoredPushRegistration,
  serializePushRegistration,
  shouldSynchronizePushRegistration,
  stalePushTokensForCurrentUser,
  tokenToDisableForCurrentUser
} from './registration-core.ts';

test('round-trips bounded device registration metadata', () => {
  const raw = serializePushRegistration('user-1', 'ios', 'ExponentPushToken[current]');
  assert.deepEqual(parseStoredPushRegistration(raw), {
    version: 2,
    userId: 'user-1',
    platform: 'ios',
    expoPushToken: 'ExponentPushToken[current]'
  });
  assert.equal(parseStoredPushRegistration('{broken'), null);
  assert.equal(parseStoredPushRegistration(JSON.stringify({ version: 2, userId: 'user-1', platform: 'web', expoPushToken: 'token' })), null);
  assert.equal(parseStoredPushRegistration('x'.repeat(4_097)), null);
});

test('retires only a rotated token owned by the current account', () => {
  const own = parseStoredPushRegistration(serializePushRegistration('user-1', 'android', 'old-token'));
  const anotherAccount = parseStoredPushRegistration(serializePushRegistration('user-2', 'android', 'other-token'));

  assert.deepEqual(stalePushTokensForCurrentUser('user-1', 'new-token', own, null), ['old-token']);
  assert.deepEqual(stalePushTokensForCurrentUser('user-1', 'new-token', anotherAccount, null), []);
  assert.deepEqual(stalePushTokensForCurrentUser('user-1', 'new-token', own, 'old-token'), ['old-token']);
});

test('migrates a legacy token without touching other devices', () => {
  assert.deepEqual(stalePushTokensForCurrentUser('user-1', 'new-token', null, 'legacy-token'), ['legacy-token']);
  assert.deepEqual(stalePushTokensForCurrentUser('user-1', 'new-token', null, 'new-token'), []);
  assert.deepEqual(stalePushTokensForCurrentUser('user-1', 'new-token', null, ' '.repeat(20)), []);
});

test('logout selects only current-account device metadata and uses bounded fallbacks', () => {
  const own = parseStoredPushRegistration(serializePushRegistration('user-1', 'ios', 'own-token'));
  const anotherAccount = parseStoredPushRegistration(serializePushRegistration('user-2', 'ios', 'other-token'));

  assert.equal(tokenToDisableForCurrentUser('user-1', own, 'legacy-token', 'live-token'), 'own-token');
  assert.equal(tokenToDisableForCurrentUser('user-1', anotherAccount, null, 'live-token'), 'live-token');
  assert.equal(tokenToDisableForCurrentUser('user-1', anotherAccount, 'legacy-token', 'live-token'), 'legacy-token');
  assert.equal(tokenToDisableForCurrentUser('user-1', null, null, 'x'.repeat(2_049)), null);
});

test('silent lifecycle sync honors an explicit device opt-out', () => {
  assert.equal(shouldSynchronizePushRegistration(false, false), true);
  assert.equal(shouldSynchronizePushRegistration(true, false), false);
  assert.equal(shouldSynchronizePushRegistration(true, true), true);
});
