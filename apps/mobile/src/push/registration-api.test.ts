import assert from 'node:assert/strict';
import test from 'node:test';
import { claimPushToken, MAX_PUSH_REGISTRATION_RETRY_AFTER_MS, parsePushRegistrationRetryAfter, PushRegistrationError, PUSH_TOKEN_REGISTRATION_ENDPOINT } from './registration-api.ts';

test('claims a token through the authenticated server endpoint', async () => {
  const result = await claimPushToken({
    platform: 'ios',
    expoPushToken: 'ExpoPushToken[abcdefghijklmnop]',
    accessToken: 'signed-user-token',
    fetchImpl: async (url, init) => {
      assert.equal(url, PUSH_TOKEN_REGISTRATION_ENDPOINT);
      assert.equal(init.method, 'POST');
      assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer signed-user-token');
      assert.deepEqual(JSON.parse(String(init.body)), {
        platform: 'ios',
        expo_push_token: 'ExpoPushToken[abcdefghijklmnop]'
      });
      return new Response(JSON.stringify({ ok: true, user_id: 'user-1', replaced_owner_count: 1 }), { status: 200 });
    }
  });
  assert.deepEqual(result, { userId: 'user-1', replacedOwnerCount: 1 });
});

test('preserves server errors and rejects malformed success responses', async () => {
  await assert.rejects(claimPushToken({
    platform: 'android', expoPushToken: 'ExpoPushToken[abcdefghijklmnop]', accessToken: 'token',
    fetchImpl: async () => new Response(JSON.stringify({ error: '登录状态已失效' }), { status: 401 })
  }), (error: unknown) => error instanceof PushRegistrationError
    && error.pushRegistrationErrorKind === 'auth'
    && /重新登录/.test(error.message));
  await assert.rejects(claimPushToken({
    platform: 'android', expoPushToken: 'ExpoPushToken[abcdefghijklmnop]', accessToken: 'token',
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
  }), /登记失败/);
});

test('treats forbidden token claims as expired authentication without scheduling a server retry', async () => {
  await assert.rejects(claimPushToken({
    platform: 'ios', expoPushToken: 'ExpoPushToken[abcdefghijklmnop]', accessToken: 'expired-token',
    fetchImpl: async () => new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'Retry-After': '120' }
    })
  }), (error: unknown) => error instanceof PushRegistrationError
    && error.pushRegistrationErrorKind === 'auth'
    && error.pushRegistrationRetryAfterMs === null);
});

test('converts request timeout to a user-facing error', async () => {
  await assert.rejects(claimPushToken({
    platform: 'ios', expoPushToken: 'ExpoPushToken[abcdefghijklmnop]', accessToken: 'token', timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })
  }), (error: unknown) => error instanceof PushRegistrationError && error.pushRegistrationErrorKind === 'network' && /推送服务超时/.test(error.message));
});

test('marks HTTP and malformed responses as server failures', async () => {
  await assert.rejects(claimPushToken({
    platform: 'ios', expoPushToken: 'ExpoPushToken[abcdefghijklmnop]', accessToken: 'token',
    fetchImpl: async () => new Response('not-json', { status: 502 })
  }), (error: unknown) => error instanceof PushRegistrationError && error.pushRegistrationErrorKind === 'server');
});

test('parses bounded Retry-After seconds and HTTP dates', () => {
  const now = Date.parse('2026-09-07T20:00:00Z');
  assert.equal(parsePushRegistrationRetryAfter('120', now), 120_000);
  assert.equal(parsePushRegistrationRetryAfter('Mon, 07 Sep 2026 20:03:00 GMT', now), 180_000);
  assert.equal(parsePushRegistrationRetryAfter('999999', now), MAX_PUSH_REGISTRATION_RETRY_AFTER_MS);
  assert.equal(parsePushRegistrationRetryAfter('invalid', now), null);
  assert.equal(parsePushRegistrationRetryAfter('-1', now), null);
});

test('preserves a valid server Retry-After delay without exposing response details', async () => {
  await assert.rejects(claimPushToken({
    platform: 'ios', expoPushToken: 'ExpoPushToken[abcdefghijklmnop]', accessToken: 'token',
    fetchImpl: async () => new Response(JSON.stringify({ error: 'temporarily unavailable' }), {
      status: 503,
      headers: { 'Retry-After': '120' }
    })
  }), (error: unknown) => error instanceof PushRegistrationError
    && error.pushRegistrationErrorKind === 'server'
    && error.pushRegistrationRetryAfterMs === 120_000);
});
