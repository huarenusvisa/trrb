import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const checks = [];
const check = (name, ok) => { checks.push([name, Boolean(ok)]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };

const pkg = JSON.parse(read('apps/mobile/package.json'));
const app = JSON.parse(read('apps/mobile/app.json')).expo;
const layout = read('apps/mobile/app/_layout.tsx');
const registration = read('apps/mobile/src/push/registration.ts');
const preferences = read('apps/mobile/src/push/preferences.ts');
const tokensMigration = read('supabase/migrations/20260816220100_app_batch2_push_tokens.sql');
const governance = read('supabase/migrations/20260817031500_app_batch2_push_governance.sql');
const adminPush = read('netlify/functions/admin-push.js');

check('expo-notifications dependency matches SDK 57', pkg.dependencies?.['expo-notifications'] === '~57.0.6');
check('native notification config plugin enabled', app.plugins?.includes('expo-notifications'));
check('iOS and Android package identities exist', Boolean(app.ios?.bundleIdentifier && app.android?.package));
check('device permission and Expo token registration implemented', registration.includes('requestPermissionsAsync') && registration.includes('getExpoPushTokenAsync'));
check('EAS projectId resolution implemented', registration.includes('easConfig?.projectId') && registration.includes('expoConfig?.extra?.eas?.projectId'));
check('token stored only in authenticated Supabase user scope', registration.includes("supabase.from('push_tokens').upsert") && registration.includes('auth.user.id'));
check('push response opens article deep link', registration.includes('addNotificationResponseReceivedListener') && registration.includes('/article/'));
check('runtime installs push handlers', layout.includes('installPushRuntimeHandlers') && layout.includes('registerPushToken'));
check('push preferences are user-scoped', preferences.includes("notification_preferences") && preferences.includes('data.user.id'));
check('push token table has RLS and own-user policies', tokensMigration.includes('enable row level security') && tokensMigration.includes('auth.uid() = user_id'));
check('preference table and server-only delivery audit exist', governance.includes('notification_preferences') && governance.includes('push_delivery_log') && governance.includes('No client policies'));
check('admin dispatch requires staff auth and published article', adminPush.includes("authenticateStaff(event, ['owner', 'admin'])") && adminPush.includes("status: 'eq.published'"));
check('server dispatch keeps Expo credential off client', adminPush.includes('process.env.EXPO_ACCESS_TOKEN') && !registration.includes('EXPO_ACCESS_TOKEN'));
check('admin dispatch respects preferences and records audit', adminPush.includes('notification_preferences') && adminPush.includes('push_delivery_log'));

// A real Expo project link is required before a physical-device token can be obtained.
const repositoryProjectId = app.extra?.eas?.projectId;
check('repository has concrete EAS projectId for physical-device verification', typeof repositoryProjectId === 'string' && repositoryProjectId.length > 20);

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`APP BATCH 2 NODE 7: BLOCKED (${failed.length} failed checks)`);
  process.exit(1);
}
console.log('APP BATCH 2 NODE 7: PASS');
