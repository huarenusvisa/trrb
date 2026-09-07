import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_PENDING_PUSH_RETRY_DELAY_MS,
  PushConnectivityGate,
  classifyPushRegistrationError,
  nextPendingPushRegistration,
  parsePendingPushRegistration,
  pendingPushRetryDelay,
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

test('persists bounded pending sync metadata without session credentials', () => {
  const now = 1_800_000_000_000;
  const raw = nextPendingPushRegistration(null, 'user-1', 'ios', 'ExpoPushToken[current-token]', now);
  assert.deepEqual(parsePendingPushRegistration(raw, now), {
    version: 1,
    userId: 'user-1',
    platform: 'ios',
    expoPushToken: 'ExpoPushToken[current-token]',
    attempts: 1,
    createdAt: now,
    retryAt: now + 15_000,
    errorKind: 'unknown'
  });
  assert.equal(raw.includes('access_token'), false);
  assert.equal(raw.includes('refresh_token'), false);
});

test('classifies retry failures without persisting sensitive error details', () => {
  const now = 1_800_000_000_000;
  const networkError = Object.assign(new Error('contains private diagnostic text'), { pushRegistrationErrorKind: 'network' });
  const raw = nextPendingPushRegistration(null, 'user-1', 'ios', null, now, classifyPushRegistrationError(networkError));
  assert.equal(parsePendingPushRegistration(raw, now)?.errorKind, 'network');
  assert.equal(raw.includes('private diagnostic text'), false);
  assert.equal(classifyPushRegistrationError(Object.assign(new Error('down'), { pushRegistrationErrorKind: 'server' })), 'server');
  assert.equal(classifyPushRegistrationError(new TypeError('offline')), 'network');
  assert.equal(classifyPushRegistrationError(new Error('other')), 'unknown');

  const legacy = JSON.stringify({ ...JSON.parse(raw), errorKind: undefined });
  assert.equal(parsePendingPushRegistration(legacy, now)?.errorKind, 'unknown');
});

test('retries only after a confirmed offline to online transition', () => {
  const gate = new PushConnectivityGate();
  assert.equal(gate.record({ isConnected: true, isInternetReachable: true }), false);
  assert.equal(gate.record({ isConnected: false, isInternetReachable: false }), false);
  assert.equal(gate.record({}), false);
  assert.equal(gate.record({ isConnected: true, isInternetReachable: false }), false);
  assert.equal(gate.record({ isConnected: true, isInternetReachable: true }), true);
  assert.equal(gate.record({ isConnected: true, isInternetReachable: true }), false);
});

test('backs off repeated pending sync while keeping delay bounded', () => {
  const now = 1_800_000_000_000;
  let currentNow = now;
  let raw = nextPendingPushRegistration(null, 'user-1', 'android', null, now);
  assert.equal(pendingPushRetryDelay(raw, 'user-1', now), 15_000);
  for (let attempt = 1; attempt < 10; attempt += 1) {
    currentNow = parsePendingPushRegistration(raw, currentNow)?.retryAt ?? currentNow;
    raw = nextPendingPushRegistration(raw, 'user-1', 'android', null, currentNow);
  }
  const pending = parsePendingPushRegistration(raw, currentNow);
  assert.equal(pending?.attempts, 10);
  assert.equal(pendingPushRetryDelay(raw, 'user-1', currentNow), MAX_PENDING_PUSH_RETRY_DELAY_MS);
  assert.ok((pending?.retryAt ?? 0) - JSON.parse(raw).createdAt <= 7 * 24 * 60 * 60 * 1_000);
  const cappedNow = pending?.retryAt ?? currentNow;
  const capped = nextPendingPushRegistration(raw, 'user-1', 'android', null, cappedNow);
  const cappedValue = parsePendingPushRegistration(capped, cappedNow);
  assert.equal((cappedValue?.retryAt ?? 0) - cappedNow, MAX_PENDING_PUSH_RETRY_DELAY_MS);
});

test('only manual retries and recovered network failures bypass the pending backoff', () => {
  const now = 1_800_000_000_000;
  const network = nextPendingPushRegistration(null, 'user-1', 'ios', null, now, 'network');
  const server = nextPendingPushRegistration(null, 'user-1', 'ios', null, now, 'server');

  assert.equal(pendingPushRetryDelay(network, 'user-1', now, 'network'), 0);
  assert.equal(pendingPushRetryDelay(server, 'user-1', now, 'network'), 15_000);
  assert.equal(pendingPushRetryDelay(network, 'user-1', now, 'foreground'), 15_000);
  assert.equal(pendingPushRetryDelay(server, 'user-1', now, 'manual'), 0);
  assert.equal(pendingPushRetryDelay(network, 'user-2', now, 'manual'), null);
});

test('isolates pending retries by account and rejects stale or malformed records', () => {
  const now = 1_800_000_000_000;
  const raw = nextPendingPushRegistration(null, 'user-1', 'ios', null, now);
  assert.equal(pendingPushRetryDelay(raw, 'user-2', now), null);
  assert.equal(parsePendingPushRegistration(raw, now + 8 * 24 * 60 * 60 * 1_000), null);
  assert.equal(parsePendingPushRegistration('{broken', now), null);
  assert.equal(parsePendingPushRegistration(JSON.stringify({ ...JSON.parse(raw), retryAt: now + 24 * 60 * 60 * 1_000 }), now), null);
  const switched = parsePendingPushRegistration(nextPendingPushRegistration(raw, 'user-2', 'ios', null, now), now);
  assert.equal(switched?.attempts, 1);
  assert.equal(switched?.userId, 'user-2');
});
