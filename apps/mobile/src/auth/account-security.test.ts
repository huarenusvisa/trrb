import assert from 'node:assert/strict';
import test from 'node:test';
import { _test, bindRecoveryEmail, getAccountSecurityStatus } from './account-security.ts';

test('normalizes account security status without exposing a full recovery email', () => {
  assert.deepEqual(_test.parseStatus({ login_type: 'phone', login_label: '+19297891391', recovery_email_masked: 'li***@example.com', email_status: 'pending', sms_status: 'disabled', can_bind_email: true }), {
    loginType: 'phone', loginLabel: '+19297891391', recoveryEmailMasked: 'li***@example.com', emailStatus: 'pending', smsStatus: 'disabled', canBindEmail: true,
  });
});

test('loads status with the current bearer token', async () => {
  const status = await getAccountSecurityStatus({ accessToken: 'token', fetchImpl: async (_url, init) => {
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer token');
    assert.deepEqual(JSON.parse(String(init.body)), { action: 'status' });
    return Response.json({ login_type: 'email', login_label: 'reader@example.com', recovery_email_masked: 're***@example.com', email_status: 'verified', sms_status: 'disabled', can_bind_email: false });
  } });
  assert.equal(status.emailStatus, 'verified');
});

test('normalizes a bound recovery email and includes the current password', async () => {
  const status = await bindRecoveryEmail(' Reader@Example.COM ', 'password123', { accessToken: 'token', fetchImpl: async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init.body)), { action: 'bind_email', recovery_email: 'reader@example.com', current_password: 'password123' });
    return Response.json({ login_type: 'phone', email_status: 'pending', sms_status: 'disabled', can_bind_email: true });
  } });
  assert.equal(status.emailStatus, 'pending');
});
