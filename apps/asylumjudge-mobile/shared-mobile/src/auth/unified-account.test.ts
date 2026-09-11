import assert from 'node:assert/strict';
import test from 'node:test';
import { accountLabel, loginOrRegister, normalizeIdentifierInput, validateCredentialCode, validateCredentials } from './unified-account.ts';

test('normalizes email casing while preserving phone punctuation', () => {
  assert.equal(normalizeIdentifierInput(' ZhangSan@Example.COM '), 'zhangsan@example.com');
  assert.equal(normalizeIdentifierInput(' (347) 873-8860 '), '(347) 873-8860');
});

test('validates the same identifier and password limits as the server', () => {
  assert.equal(validateCredentialCode('', ''), 'required');
  assert.equal(validateCredentialCode('not-an-account', 'password'), 'identifier');
  assert.equal(validateCredentialCode('user@example.com', 'short'), 'password');
  assert.equal(validateCredentialCode('+1 347 873 8860', 'password123'), null);
  assert.match(validateCredentials('not-an-account', 'password'), /有效/);
  assert.match(validateCredentials('user@example.com', 'short'), /8–128/);
  assert.equal(validateCredentials('+1 347 873 8860', 'password123'), '');
});

test('returns a validated new-account session', async () => {
  const result = await loginOrRegister(' New@Example.com ', 'password123', {
    fetchImpl: async (_url, init) => {
      assert.deepEqual(JSON.parse(String(init.body)), { identifier: 'new@example.com', password: 'password123' });
      return new Response(JSON.stringify({
        created: true,
        account: { type: 'email', label: 'new@example.com' },
        session: { access_token: 'access', refresh_token: 'refresh' },
      }), { status: 200 });
    },
  });
  assert.equal(result.created, true);
  assert.equal(result.session.refresh_token, 'refresh');
});

test('preserves server errors and rejects malformed success responses', async () => {
  await assert.rejects(
    loginOrRegister('user@example.com', 'password123', {
      fetchImpl: async () => new Response(JSON.stringify({ error: '账号或密码错误' }), { status: 401 }),
    }),
    /账号或密码错误/,
  );
  await assert.rejects(
    loginOrRegister('user@example.com', 'password123', {
      fetchImpl: async () => new Response(JSON.stringify({ created: false, session: {} }), { status: 200 }),
    }),
    /登录状态无效/,
  );
});

test('converts timeouts to a user-facing network message', async () => {
  await assert.rejects(
    loginOrRegister('user@example.com', 'password123', {
      timeoutMs: 5,
      fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    }),
    /连接账号服务超时/,
  );
});

test('shows a phone login label instead of the private auth email', () => {
  assert.equal(accountLabel({ email: 'phone.13478738860@accounts.trrb.invalid', user_metadata: { login_label: '+13478738860' } }), '+13478738860');
});
