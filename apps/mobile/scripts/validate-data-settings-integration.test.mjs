import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('keeps profile settings on explicit presentation-field privileges', () => {
  const migration = read('../../supabase/migrations/20260903172316_repair_mobile_profile_notifications.sql');
  const profileUpdateMigration = read('../../supabase/migrations/20260910120000_mobile_rich_messages_and_profile_update.sql');
  const settings = read('app/profile-settings.tsx');

  assert.match(migration, /grant select\(id, display_name, avatar_key, bio, status\)/);
  assert.match(migration, /grant update\(display_name, avatar_key, bio\)/);
  assert.doesNotMatch(migration, /grant update on public\.profiles to authenticated/);
  assert.match(settings, /\.eq\('id', user\.id\)/);
  assert.match(settings, /supabase\.rpc\('update_my_profile'/);
  assert.match(profileUpdateMigration, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(profileUpdateMigration, /revoke all on function public\.update_my_profile[^;]+from public, anon/);
});

test('limits notification access to the signed-in owner and read state', () => {
  const migration = read('../../supabase/migrations/20260903172316_repair_mobile_profile_notifications.sql');

  assert.match(migration, /enable row level security/);
  assert.match(migration, /auth\.uid\(\)\) = user_id/);
  assert.match(migration, /grant select on public\.user_notifications to authenticated/);
  assert.match(migration, /grant update\(is_read\) on public\.user_notifications to authenticated/);
  assert.doesNotMatch(migration, /grant insert[^;]*user_notifications to authenticated/);
});

test('persists font size before updating the selection and notifies open articles', () => {
  const preferences = read('src/storage/reading-preferences.ts');
  const profile = read('app/(tabs)/profile.tsx');
  const article = read('app/article/[id].tsx');

  assert.match(preferences, /await AsyncStorage\.setItem/);
  assert.match(preferences, /listeners\.forEach/);
  assert.match(profile, /await setReadingFontScale\(scale\);\s*setFontScale\(scale\)/);
  assert.match(profile, /testID="font-scale-preview"/);
  assert.match(article, /subscribeReadingPreferences/);
});

test('keeps localized profile controls and account deletion on the existing account service', () => {
  const profile = read('app/(tabs)/profile.tsx');
  const deletion = read('app/delete-account.tsx');

  assert.match(profile, /t\('profile\.fontSize'\)/);
  assert.match(profile, /t\('profile\.accountPrivacy'\)/);
  assert.match(deletion, /useI18n\(\)/);
  assert.match(deletion, /supabase\.auth\.getSession\(\)/);
  assert.match(deletion, /fetch\('\/\.netlify\/functions\/delete-account'/);
  assert.match(deletion, /supabase\.auth\.signOut\(\)/);
  assert.doesNotMatch(deletion, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test('keeps authenticated profile loading distinct from guest mode and reports broken legal links', () => {
  const profile = read('app/(tabs)/profile.tsx');

  assert.match(profile, /setSession\(next\);[\s\S]*setLoading\(true\);[\s\S]*await loadProfile\(next\);[\s\S]*setLoading\(false\)/);
  assert.match(profile, /testID="profile-loading"/);
  assert.match(profile, /testID="profile-load-error"/);
  assert.match(profile, /session \? <AsyncStatePanel/);
  assert.match(profile, /await Linking\.canOpenURL\(url\)/);
  assert.match(profile, /await Linking\.openURL\(url\)/);
  assert.match(profile, /t\('profile\.linkOpenFailedBody'/);
});

test('isolates local favorites, history and personal-post drafts by account', () => {
  const library = read('src/storage/library.ts');
  const draft = read('src/storage/profilePostDraft.ts');
  const compose = read('app/profile-compose.tsx');

  assert.match(library, /resolveAccountStorageKey\(AsyncStorage, FAVORITES_KEY, userId,/);
  assert.match(library, /resolveAccountStorageKey\(AsyncStorage, HISTORY_KEY, userId,/);
  assert.match(library, /writeList\(scope\.key, next\)/);
  assert.match(draft, /loadProfilePostDraft\(userId: string\)/);
  assert.match(draft, /saveProfilePostDraft\(userId: string, caption: string\)/);
  assert.match(compose, /draftUserId = useRef<string \| null>\(null\)/);
  assert.match(compose, /saveProfilePostDraft\(draftUserId\.current, latestCaption\.current\)/);
});

test('keeps authenticated profile-media uploads on the supported storage search path', () => {
  const migration = read('../../supabase/migrations/20260909011903_repair_authenticated_storage_search_path.sql');

  assert.match(migration, /alter role authenticated set search_path = public, storage;/i);
  assert.doesNotMatch(migration, /alter\s+(table|schema)\s+storage\./i);
  assert.doesNotMatch(migration, /grant\s+all/i);
});
