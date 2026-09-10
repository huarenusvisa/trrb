import assert from 'node:assert/strict';
import test from 'node:test';
import recoverAccount from './unified-account-recovery.mjs';

const originalFetch = globalThis.fetch;
const originalNetlify = globalThis.Netlify;

function installEnvironment(handler) {
  globalThis.Netlify = { env: { get(name) {
    return { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon' }[name] || '';
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
