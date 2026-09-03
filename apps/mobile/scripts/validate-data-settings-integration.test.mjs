import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('keeps profile settings on explicit presentation-field privileges', () => {
  const migration = read('../../supabase/migrations/20260903172316_repair_mobile_profile_notifications.sql');
  const settings = read('app/profile-settings.tsx');

  assert.match(migration, /grant select\(id, display_name, avatar_key, bio, status\)/);
  assert.match(migration, /grant update\(display_name, avatar_key, bio\)/);
  assert.doesNotMatch(migration, /grant update on public\.profiles to authenticated/);
  assert.match(settings, /\.eq\('id', user\.id\)/);
  assert.match(settings, /\.eq\('id', userId\)/);
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
