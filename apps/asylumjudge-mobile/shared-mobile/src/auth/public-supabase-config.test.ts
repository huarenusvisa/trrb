import assert from 'node:assert/strict';
import test from 'node:test';
import { isSafePublicSupabaseConfig, resolvePublicSupabaseConfig } from './public-supabase-config.ts';

test('bundles a production-safe public client configuration when EAS variables are absent', () => {
  const config = resolvePublicSupabaseConfig();

  assert.equal(config.source, 'bundled-production');
  assert.equal(config.url, 'https://fwiznbpsqkfgkvyznebz.supabase.co');
  assert.match(config.key, /^sb_publishable_/);
  assert.doesNotMatch(config.key, /service_role|sb_secret_/);
  assert.equal(isSafePublicSupabaseConfig(config), true);
});

test('accepts a rotated publishable key for the same production project', () => {
  const config = resolvePublicSupabaseConfig({
    url: 'https://fwiznbpsqkfgkvyznebz.supabase.co',
    key: 'sb_publishable_rotated-key_123',
  });

  assert.equal(config.source, 'environment');
  assert.equal(config.key, 'sb_publishable_rotated-key_123');
});

test('rejects another project, legacy JWTs, and secret keys', () => {
  for (const environment of [
    { url: 'https://another.supabase.co', key: 'sb_publishable_other' },
    { url: 'https://fwiznbpsqkfgkvyznebz.supabase.co', key: 'eyJlegacy-anon' },
    { url: 'https://fwiznbpsqkfgkvyznebz.supabase.co', key: 'sb_secret_backend-only' },
  ]) {
    const config = resolvePublicSupabaseConfig(environment);
    assert.equal(config.source, 'bundled-production');
    assert.equal(isSafePublicSupabaseConfig(config), true);
  }
});
