import assert from 'node:assert/strict';
import test from 'node:test';
import changePassword from './unified-account-change-password.mjs';

const originalFetch = globalThis.fetch;
const originalNetlify = globalThis.Netlify;

function installEnvironment(handler) {
  globalThis.Netlify = { env: { get(name) {
    return { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' }[name] || '';
  } } };
  globalThis.fetch = handler;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.Netlify = originalNetlify;
});

test('requires POST and a signed-in account', async () => {
  installEnvironment(async () => { throw new Error('fetch must not run'); });
  assert.equal((await changePassword(new Request('https://trrb.net/change', { method: 'GET' }))).status, 405);
  assert.equal((await changePassword(new Request('https://trrb.net/change', { method: 'POST' }))).status, 401);
});

test('verifies the current password before updating and returns a fresh session', async () => {
  const calls = [];
  installEnvironment(async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'user-1', email: 'reader@example.com' });
    if (String(url).includes('/auth/v1/admin/users/')) return Response.json({ id: 'user-1' });
    const body = JSON.parse(String(options.body || '{}'));
    if (body.password === 'current-pass') return Response.json({ access_token: 'old', refresh_token: 'old-refresh' });
    if (body.password === 'new-password') return Response.json({ access_token: 'new', refresh_token: 'new-refresh' });
    return Response.json({ error: { message: 'bad password' } }, { status: 400 });
  });
  const response = await changePassword(new Request('https://trrb.net/change', {
    method: 'POST',
    headers: { Authorization: 'Bearer session-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: 'current-pass', new_password: 'new-password' }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).session, { access_token: 'new', refresh_token: 'new-refresh' });
  assert.equal(calls.filter((call) => call.url.includes('/auth/v1/token')).length, 2);
  assert.equal(calls.filter((call) => call.url.includes('/auth/v1/admin/users/')).length, 1);
});

test('never updates when the current password is wrong', async () => {
  const calls = [];
  installEnvironment(async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'user-1', email: 'reader@example.com' });
    return Response.json({ error: { message: 'bad password' } }, { status: 400 });
  });
  const response = await changePassword(new Request('https://trrb.net/change', {
    method: 'POST',
    headers: { Authorization: 'Bearer session-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: 'wrong-pass', new_password: 'new-password' }),
  }));
  assert.equal(response.status, 401);
  assert.equal(calls.some((url) => url.includes('/auth/v1/admin/users/')), false);
});
