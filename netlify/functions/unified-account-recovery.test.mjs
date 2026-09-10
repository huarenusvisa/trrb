import assert from 'node:assert/strict';
import test from 'node:test';
import recoverAccount, { _test } from './unified-account-recovery.mjs';

const originalFetch = globalThis.fetch;
const originalNetlify = globalThis.Netlify;

function installEnvironment(handler, extraEnv = {}) {
  globalThis.Netlify = { env: { get(name) {
    return { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon', ...extraEnv }[name] || '';
  } } };
  globalThis.fetch = handler;
}

function post(body) {
  return new Request('https://trrb.net/.netlify/functions/unified-account-recovery', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test.afterEach(() => { globalThis.fetch = originalFetch; globalThis.Netlify = originalNetlify; });

test('rejects unsupported methods and invalid identifiers', async () => {
  installEnvironment(async () => { throw new Error('fetch must not run'); });
  assert.equal((await recoverAccount(new Request('https://trrb.net/recover'))).status, 405);
  assert.equal((await recoverAccount(post({ identifier: 'bad' }))).status, 400);
});

test('routes phone aliases to verified support without calling Supabase', async () => {
  installEnvironment(async () => { throw new Error('fetch must not run'); });
  const response = await recoverAccount(post({ identifier: '(929) 789-1391' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { method: 'support', support_email: 'tangrenribao@gmail.com' });
});

test('sends a recovery email for a phone account with a verified recovery channel', async () => {
  const calls = [];
  installEnvironment(async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('account_login_identifiers')) return Response.json([{ user_id: 'user-1' }]);
    if (String(url).includes('account_recovery_channels')) return Response.json([{ recovery_email: 'reader@example.com', email_status: 'verified' }]);
    return Response.json({});
  }, { SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
  const response = await recoverAccount(post({ identifier: '(929) 789-1391' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { method: 'email' });
  const recoverCall = calls.find((call) => call.url.includes('/auth/v1/recover'));
  assert.deepEqual(JSON.parse(String(recoverCall.options.body)), { email: 'reader@example.com' });
});

test('requests an email recovery link with the production reset redirect', async () => {
  const calls = [];
  installEnvironment(async (url, options) => { calls.push({ url: String(url), options }); return Response.json({}); });
  const response = await recoverAccount(post({ identifier: ' Reader@Example.com ' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { method: 'email' });
  assert.match(calls[0].url, /\/auth\/v1\/recover\?redirect_to=https%3A%2F%2Ftrrb\.net%2Freset-password%2F/);
  assert.deepEqual(JSON.parse(String(calls[0].options.body)), { email: 'reader@example.com' });
});

test('does not reveal whether an email account exists', async () => {
  installEnvironment(async () => Response.json({ message: 'User not found' }, { status: 400 }));
  const response = await recoverAccount(post({ identifier: 'missing@example.com' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { method: 'email' });
});

test('validates a recovery token and updates only that user password', async () => {
  const calls = [];
  installEnvironment(async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (!options.method) return Response.json({ id: 'user-1' });
    return Response.json({ id: 'user-1' });
  });
  const response = await recoverAccount(post({ action: 'complete', access_token: 'recovery-token', password: 'new-password' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { updated: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer recovery-token');
  assert.deepEqual(JSON.parse(String(calls[1].options.body)), { password: 'new-password' });
});

test('confirms a pending recovery email without changing the password', async () => {
  const calls = [];
  installEnvironment(async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'user-1', email: 'reader@example.com' });
    if (String(url).includes('account_recovery_channels') && options.method === 'GET') return Response.json([{ recovery_email: 'reader@example.com', email_status: 'pending' }]);
    return Response.json({});
  }, { SUPABASE_SERVICE_ROLE_KEY: 'service-key' });
  const response = await recoverAccount(post({ action: 'verify_email', access_token: 'recovery-token' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { verified: true });
  assert.equal(calls.some((call) => call.url.includes('account_recovery_channels') && call.options.method === 'PATCH'), true);
  assert.equal(calls.some((call) => call.options.method === 'PUT'), false);
});

test('never exposes an English database constraint to the client', () => {
  const translated = _test.clientError(Object.assign(new Error('duplicate key value violates unique constraint "users_email_partial_key"'), { statusCode: 500 }));
  assert.equal(translated.statusCode, 409);
  assert.equal(translated.message, '这个邮箱已经属于另一个唐人日报账号');
});
