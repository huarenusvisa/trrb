import assert from 'node:assert/strict';
import test from 'node:test';
import { claimPushToken, PUSH_TOKEN_REGISTRATION_ENDPOINT } from './registration-api.ts';

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
  }), /登录状态已失效/);
  await assert.rejects(claimPushToken({
    platform: 'android', expoPushToken: 'ExpoPushToken[abcdefghijklmnop]', accessToken: 'token',
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
  }), /登记失败/);
});

test('converts request timeout to a user-facing error', async () => {
  await assert.rejects(claimPushToken({
    platform: 'ios', expoPushToken: 'ExpoPushToken[abcdefghijklmnop]', accessToken: 'token', timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })
  }), /推送服务超时/);
});
