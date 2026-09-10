import assert from 'node:assert/strict';
import test from 'node:test';
import accountSecurity, { _test } from './unified-account-security.mjs';

const originalFetch = globalThis.fetch;
const originalNetlify = globalThis.Netlify;

function installEnvironment(handler) {
  globalThis.Netlify = { env: { get(name) {
    return { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }[name] || '';
  } } };
  globalThis.fetch = handler;
}

function post(body, token = 'access-token') {
  return new Request('https://trrb.net/.netlify/functions/unified-account-security', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test.afterEach(() => { globalThis.fetch = originalFetch; globalThis.Netlify = originalNetlify; });

test('masks recovery emails and derives the legacy phone alias', () => {
  assert.equal(_test.maskEmail('lixin@example.com'), 'li***@example.com');
  assert.equal(_test.phoneAlias('+1 (929) 789-1391'), 'phone.19297891391@accounts.trrb.invalid');
  assert.equal(_test.normalizeEmail(' Phone.1@accounts.trrb.invalid '), '');
});

test('returns a phone account status without exposing the full recovery email', async () => {
  installEnvironment(async (url) => {
    if (String(url).includes('/auth/v1/user')) return Response.json({ id: 'user-1', email: 'phone.19297891391@accounts.trrb.invalid', user_metadata: { login_type: 'phone', login_label: '+19297891391' } });
    return Response.json([{ recovery_email: 'lixin@example.com', email_status: 'verified', sms_status: 'disabled' }]);
  });
  const response = await accountSecurity(post({ action: 'status' }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { login_type: 'phone', login_label: '+19297891391', recovery_email_masked: 'li***@example.com', email_status: 'verified', sms_status: 'disabled', can_bind_email: true });
});

test('binds a phone account recovery email only after validating the current password', async () => {
  const calls = [];
  installEnvironment(async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'user-1', email: 'phone.19297891391@accounts.trrb.invalid', user_metadata: { login_type: 'phone', login_label: '+19297891391' } });
    if (String(url).includes('account_recovery_channels') && !options.method) return Response.json([]);
    if (String(url).includes('/auth/v1/token')) return Response.json({ user: { id: 'user-1' } });
    return Response.json({});
  });
  const response = await accountSecurity(post({ action: 'bind_email', recovery_email: 'LiXin@Example.com', current_password: 'password123' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.email_status, 'pending');
  assert.equal(body.recovery_email_masked, 'li***@example.com');
  assert.equal(calls.some((call) => call.url.includes('account_login_identifiers') && call.options.method === 'POST'), true);
  assert.equal(calls.some((call) => call.url.includes('/auth/v1/admin/users/user-1') && JSON.parse(String(call.options.body)).email === 'lixin@example.com'), true);
  assert.equal(calls.some((call) => call.url.includes('/auth/v1/recover?redirect_to=https%3A%2F%2Ftrrb.net%2Freset-password%2F%3Fmode%3Dbind-email')), true);
});

test('does not change account data when the current password is wrong', async () => {
  const calls = [];
  installEnvironment(async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).endsWith('/auth/v1/user')) return Response.json({ id: 'user-1', email: 'phone.19297891391@accounts.trrb.invalid', user_metadata: { login_type: 'phone', login_label: '+19297891391' } });
    if (String(url).includes('account_recovery_channels') && !options.method) return Response.json([]);
    if (String(url).includes('/auth/v1/token')) return Response.json({ message: 'Invalid login credentials' }, { status: 400 });
    return Response.json({});
  });
  const response = await accountSecurity(post({ action: 'bind_email', recovery_email: 'lixin@example.com', current_password: 'wrongpass' }));
  assert.equal(response.status, 401);
  assert.equal(calls.some((url) => url.includes('/auth/v1/admin/users/')), false);
});
