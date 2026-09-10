const assert = require('node:assert/strict');
const test = require('node:test');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const recovery = require('./admin-account-recovery');
const originalFetch = global.fetch;

test.afterEach(() => { global.fetch = originalFetch; });

test('normalizes the legacy phone account and rejects internal aliases as recovery email', () => {
  assert.equal(recovery._test.normalizePhone('(929) 789-1391'), '+19297891391');
  assert.equal(recovery._test.phoneAlias('9297891391'), 'phone.19297891391@accounts.trrb.invalid');
  assert.equal(recovery._test.normalizeEmail(' Li9297891391@Gmail.com '), 'li9297891391@gmail.com');
  assert.equal(recovery._test.normalizeEmail('phone.1@accounts.trrb.invalid'), '');
  assert.equal(recovery._test.maskEmail('li9297891391@gmail.com'), 'li********@gmail.com');
});

test('admin approval binds the verified recovery email and sends a reset link without storing the code', async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, options });
    if (href.endsWith('/auth/v1/user')) return Response.json({ id: 'admin-1', email: 'owner@trrb.net' });
    if (href.includes('/rest/v1/admin_users')) return Response.json([{ id: 'staff-1', user_id: 'admin-1', role: 'owner', is_active: true }]);
    if (href.includes('/auth/v1/admin/users?page=')) {
      return Response.json({ users: [{
        id: 'user-1',
        email: 'phone.19297891391@accounts.trrb.invalid',
        user_metadata: { login_type: 'phone', login_label: '+19297891391' }
      }] });
    }
    if (href.includes('/rest/v1/account_login_identifiers') && (!options.method || options.method === 'GET')) return Response.json([]);
    if (href.includes('/rest/v1/account_recovery_admin_actions') && options.method === 'POST') return Response.json([{ id: 'audit-1' }]);
    return Response.json({});
  };

  const response = await recovery.handler({
    httpMethod: 'POST',
    headers: { authorization: 'Bearer admin-token' },
    body: JSON.stringify({
      action: 'approve',
      phone: '9297891391',
      recovery_email: 'li9297891391@gmail.com',
      verification_code: '324251',
      verification_method: 'manual_sms',
      confirmed: true
    })
  });

  assert.equal(response.statusCode, 200);
  const authUpdate = calls.find((call) => call.href.endsWith('/auth/v1/admin/users/user-1') && call.options.method === 'PUT');
  assert.deepEqual(JSON.parse(authUpdate.options.body), { email: 'li9297891391@gmail.com', email_confirm: true });
  const channelCall = calls.find((call) => call.href.includes('/rest/v1/account_recovery_channels') && call.options.method === 'POST');
  assert.equal(JSON.parse(channelCall.options.body).email_status, 'verified');
  const recoverCall = calls.find((call) => call.href.includes('/auth/v1/recover'));
  assert.match(recoverCall.href, /redirect_to=https%3A%2F%2Ftrrb.net%2Freset-password%2F/);
  assert.deepEqual(JSON.parse(recoverCall.options.body), { email: 'li9297891391@gmail.com' });
  const auditCall = calls.find((call) => call.href.includes('/rest/v1/account_recovery_admin_actions') && call.options.method === 'POST');
  const auditBody = JSON.parse(auditCall.options.body);
  assert.notEqual(auditBody.verification_code_hash, '324251');
  assert.equal(JSON.stringify(auditBody).includes('324251'), false);
});

test('admin approval requires an explicit six-digit reply and confirmation', async () => {
  global.fetch = async (url) => {
    const href = String(url);
    if (href.endsWith('/auth/v1/user')) return Response.json({ id: 'admin-1' });
    if (href.includes('/rest/v1/admin_users')) return Response.json([{ id: 'staff-1', user_id: 'admin-1', role: 'owner', is_active: true }]);
    return Response.json({});
  };
  const response = await recovery.handler({
    httpMethod: 'POST', headers: { authorization: 'Bearer token' },
    body: JSON.stringify({ action: 'approve', phone: '9297891391', recovery_email: 'reader@example.com', verification_code: '12345', confirmed: false })
  });
  assert.equal(response.statusCode, 400);
});
