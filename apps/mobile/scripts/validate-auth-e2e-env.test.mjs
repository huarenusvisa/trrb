import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateAuthE2eEnvironment } from './validate-auth-e2e-env.mjs';

const validEnvironment = {
  MAESTRO_TEST_ACCOUNT_IDENTIFIER: 'trrb-e2e-mobile@example.invalid',
  MAESTRO_TEST_ACCOUNT_PASSWORD: 'marked-test-password',
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
};

test('accepts a fully configured marked test account', () => {
  assert.deepEqual(validateAuthE2eEnvironment(validEnvironment), []);
});

test('rejects an unmarked account to protect real users', () => {
  const failures = validateAuthE2eEnvironment({ ...validEnvironment, MAESTRO_TEST_ACCOUNT_IDENTIFIER: 'real-user@example.com' });
  assert.match(failures.join('\n'), /marked trrb-e2e/);
});

test('requires password and public Supabase build configuration without printing values', () => {
  const failures = validateAuthE2eEnvironment({ MAESTRO_TEST_ACCOUNT_IDENTIFIER: 'trrb-e2e-mobile@example.invalid' });
  assert.equal(failures.length, 3);
  assert.match(failures.join('\n'), /PASSWORD/);
  assert.match(failures.join('\n'), /SUPABASE_URL/);
  assert.match(failures.join('\n'), /ANON_KEY/);
});

test('keeps credentials out of the flow and wires both platforms to the marked-account test', () => {
  const mobileRoot = path.resolve(import.meta.dirname, '..');
  const flow = fs.readFileSync(path.join(mobileRoot, '.maestro/auth-login.yml'), 'utf8');
  const workflow = fs.readFileSync(path.join(mobileRoot, '.eas/workflows/auth-e2e.yml'), 'utf8');

  assert.match(flow, /\$\{MAESTRO_TEST_ACCOUNT_IDENTIFIER\}/);
  assert.match(flow, /\$\{MAESTRO_TEST_ACCOUNT_PASSWORD\}/);
  assert.match(flow, /profile-sign-out/);
  assert.doesNotMatch(flow, /password\s*:/i);
  assert.match(workflow, /environment:\s*preview/);
  assert.match(workflow, /platform:\s*android/);
  assert.match(workflow, /platform:\s*ios/);
  assert.equal((workflow.match(/flow_path:\s*'\.maestro\/auth-login\.yml'/g) || []).length, 2);
});
