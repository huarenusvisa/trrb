import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const client = read('apps/mobile/src/auth/supabase.ts');
const auth = read('apps/mobile/app/auth.tsx');
const profile = read('apps/mobile/app/(tabs)/profile.tsx');
const pkg = JSON.parse(read('apps/mobile/package.json'));

const checks = [
  ['Supabase JS dependency installed', Boolean(pkg.dependencies?.['@supabase/supabase-js'])],
  ['session uses AsyncStorage persistence', /storage:\s*AsyncStorage/.test(client) && /persistSession:\s*true/.test(client)],
  ['token auto refresh enabled', /autoRefreshToken:\s*true/.test(client)],
  ['single public Supabase project configuration', /EXPO_PUBLIC_SUPABASE_URL/.test(client) && /EXPO_PUBLIC_SUPABASE_ANON_KEY/.test(client)],
  ['no service-role/admin secret in mobile auth client', !/service[_-]?role|SUPABASE_SERVICE_ROLE|admin[_-]?key/i.test(client)],
  ['email password registration implemented', /auth\.signUp/.test(auth)],
  ['email password login implemented', /auth\.signInWithPassword/.test(auth)],
  ['guest browsing remains explicit', /游客/.test(auth) && /router\.back/.test(auth)],
  ['session restoration and auth-state listener implemented', /auth\.getSession/.test(profile) && /onAuthStateChange/.test(profile)],
  ['logout implemented', /auth\.signOut/.test(profile)],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed += 1;
}

if (failed) {
  console.error(`APP BATCH 1 NODE 3: FAIL (${checks.length - failed}/${checks.length})`);
  process.exit(1);
}
console.log(`APP BATCH 1 NODE 3: PASS (${checks.length}/${checks.length})`);
