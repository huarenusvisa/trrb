import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260816135000_trrb_profile_settings_constraints.sql','utf8');
const settings = fs.readFileSync('apps/mobile/app/profile-settings.tsx','utf8');
const profileTab = fs.readFileSync('apps/mobile/app/(tabs)/profile.tsx','utf8');

const checks = [
  ['profile tab links to account settings', profileTab.includes("router.push('/profile-settings')")],
  ['settings screen reads authenticated profile', settings.includes("from('profiles').select('id,display_name,avatar_key,bio')") && settings.includes("supabase.auth.getSession()")],
  ['settings screen updates shared profile row', settings.includes("from('profiles')") && settings.includes('.update({ display_name: trimmedName, bio: trimmedBio, avatar_key: avatar })')],
  ['nickname client bounds 2-32', settings.includes('trimmedName.length < 2') && settings.includes('trimmedName.length > 32')],
  ['bio client bound 240', settings.includes('trimmedBio.length > 240') && settings.includes('maxLength={240}')],
  ['default avatar picker uses local renderer', settings.includes('TrRbAvatar') && settings.includes('120')],
  ['server enforces nickname length', migration.includes("char_length(new.display_name) < 2") && migration.includes("char_length(new.display_name) > 32")],
  ['server blocks reserved identities', migration.includes('trrb_name_is_reserved')],
  ['server enforces bio length', migration.includes('char_length(new.bio) > 240')],
  ['server rejects abnormal avatar keys', migration.includes('avatar_key_invalid') && migration.includes("new.avatar_key !~ '^avatar_")]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`APP BATCH 1 NODE 4: FAIL (${checks.length - failed}/${checks.length})`);
  process.exit(1);
}
console.log(`APP BATCH 1 NODE 4: PASS (${checks.length}/${checks.length})`);
