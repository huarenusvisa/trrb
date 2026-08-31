const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePhone, normalizeIdentifier } = require('./unified-account-login')._test;
const fs = require('node:fs');

test('normalizes US phone numbers', () => {
  assert.equal(normalizePhone('(347) 873-8860'), '+13478738860');
  assert.equal(normalizePhone('+86 138 0013 8000'), '+8613800138000');
});

test('maps phone accounts to a deterministic private auth email', () => {
  const value = normalizeIdentifier('347-873-8860');
  assert.equal(value.type, 'phone');
  assert.equal(value.label, '+13478738860');
  assert.equal(value.authEmail, 'phone.13478738860@accounts.trrb.invalid');
  assert.equal(value.displayName, '用户8860');
});

test('uses the email local part as the default display name', () => {
  const value = normalizeIdentifier('ZhangSan@example.com');
  assert.equal(value.type, 'email');
  assert.equal(value.authEmail, 'zhangsan@example.com');
  assert.equal(value.displayName, 'zhangsan');
});

test('new registration never uses the admin auto-confirm endpoint', () => {
  const source = fs.readFileSync(require.resolve('./unified-account-login'), 'utf8');
  assert.doesNotMatch(source, /email_confirm\s*:\s*true/);
  assert.doesNotMatch(source, /createConfirmedUser/);
  assert.match(source, /auth\/v1\/signup/);
  assert.match(source, /verification_required/);
});
