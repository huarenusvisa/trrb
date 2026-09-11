import { pathToFileURL } from 'node:url';

export function validateAuthE2eEnvironment(env) {
  const failures = [];
  const identifier = String(env.MAESTRO_TEST_ACCOUNT_IDENTIFIER || '').trim().toLowerCase();
  const password = String(env.MAESTRO_TEST_ACCOUNT_PASSWORD || '');
  const contentSuffix = String(env.MAESTRO_TEST_CONTENT_SUFFIX || '').trim();

  if (!/^trrb-e2e-[a-z0-9._+-]*@[a-z0-9.-]+\.[a-z]{2,}$/i.test(identifier)) {
    failures.push('MAESTRO_TEST_ACCOUNT_IDENTIFIER must be a marked trrb-e2e-* email');
  }
  if (password.length < 8 || password.length > 128) {
    failures.push('MAESTRO_TEST_ACCOUNT_PASSWORD must contain 8-128 characters');
  }
  if (!/^[a-z0-9][a-z0-9-]{5,31}$/.test(contentSuffix)) {
    failures.push('MAESTRO_TEST_CONTENT_SUFFIX must contain 6-32 lowercase letters, numbers, or hyphens');
  }
  if (!/^https:\/\//.test(String(env.EXPO_PUBLIC_SUPABASE_URL || ''))) {
    failures.push('EXPO_PUBLIC_SUPABASE_URL is missing from the preview environment');
  }
  if (!String(env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim()) {
    failures.push('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing from the preview environment');
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = validateAuthE2eEnvironment(process.env);
  if (failures.length) {
    console.error('Unified account E2E preflight failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('Unified account E2E environment: PASS');
}
