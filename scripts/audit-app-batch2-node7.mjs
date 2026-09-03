import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const checks = [];
const check = (name, ok) => { checks.push([name, Boolean(ok)]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };

const pkg = JSON.parse(read('apps/mobile/package.json'));
const app = JSON.parse(read('apps/mobile/app.json')).expo;
const layout = read('apps/mobile/app/_layout.tsx');
const registration = read('apps/mobile/src/push/registration.ts');
const preferences = read('apps/mobile/src/push/preferences.ts');
const settings = read('apps/mobile/app/push-settings.tsx');
const profile = read('apps/mobile/app/(tabs)/profile.tsx');
const tokensMigration = read('supabase/migrations/20260816220100_app_batch2_push_tokens.sql');
const governance = read('supabase/migrations/20260817031500_app_batch2_push_governance.sql');
const adminPush = read('netlify/functions/admin-push.js');
const receiptProcessor = read('netlify/functions/push-receipts.mjs');
const expoPushClient = read('netlify/functions/_shared/expo-push-client.js');
const receiptMigration = read('supabase/migrations/20260903110000_push_receipt_lifecycle.sql');

check('expo-notifications dependency matches SDK 57', pkg.dependencies?.['expo-notifications'] === '~57.0.6');
check('native notification config plugin enabled', app.plugins?.includes('expo-notifications'));
check('iOS and Android package identities exist', Boolean(app.ios?.bundleIdentifier && app.android?.package));
check('device permission and Expo token registration implemented', registration.includes('requestPermissionsAsync') && registration.includes('getExpoPushTokenAsync'));
check('EAS projectId resolution implemented', registration.includes('easConfig?.projectId') && registration.includes('expoConfig?.extra?.eas?.projectId'));
check('token stored only in authenticated Supabase user scope', registration.includes("supabase.from('push_tokens').upsert") && registration.includes('auth.user.id'));
check('push response handles cold and warm starts', registration.includes('getLastNotificationResponse()') && registration.includes('addNotificationResponseReceivedListener'));
check('runtime installs handlers and silent authenticated token sync', layout.includes('installPushRuntimeHandlers') && layout.includes('installPushRegistrationLifecycle'));
check('permission prompt requires an explicit settings action', registration.includes('options.requestPermission === true') && settings.includes('requestPermission: true') && !layout.includes('registerPushToken()'));
check('settings expose device control and five preference types', settings.includes('push-device-toggle') && ['breaking_news', 'ice', 'immigration', 'legal', 'community'].every((key) => settings.includes(key)));
check('sign-out attempts to disable current device token first', profile.includes('await disableCurrentDevicePushToken()') && profile.includes('await finishSignOut()'));
check('push preferences are user-scoped', preferences.includes("notification_preferences") && preferences.includes('data.user.id'));
check('push token table has RLS and own-user policies', tokensMigration.includes('enable row level security') && tokensMigration.includes('auth.uid() = user_id'));
check('preference table and server-only delivery audit exist', governance.includes('notification_preferences') && governance.includes('push_delivery_log') && governance.includes('No client policies'));
check('admin dispatch requires staff auth and published article', adminPush.includes("authenticateStaff(event, ['owner', 'editor'])") && adminPush.includes("status: 'eq.published'"));
check('server dispatch keeps Expo credential off client', adminPush.includes('process.env.EXPO_ACCESS_TOKEN') && !registration.includes('EXPO_ACCESS_TOKEN'));
check('admin dispatch respects preferences and records audit', adminPush.includes('notification_preferences') && adminPush.includes('push_delivery_log'));
check('accepted push tickets are queued for receipt checks', adminPush.includes('push_ticket_receipts') && adminPush.includes('receipt_tracking_count'));
check('receipt worker disables only invalid device tokens', receiptProcessor.includes('groupReceiptOutcomes') && receiptProcessor.includes("patchByIds('push_tokens', outcomes.invalidTokenIds"));
check('receipt queue is server-only with pending index', receiptMigration.includes('enable row level security') && receiptMigration.includes('No client policies') && receiptMigration.includes("where status = 'pending'"));
check('receipt worker runs hourly and waits at least 15 minutes', receiptProcessor.includes("schedule: '@hourly'") && receiptProcessor.includes('FIFTEEN_MINUTES'));
check('receipt worker safely waits for migration deployment', receiptProcessor.includes('isMissingReceiptQueueError') && receiptProcessor.includes('status: 200'));
check('Expo requests retry only transient failures with bounded backoff', expoPushClient.includes("status === 429 || (status >= 500 && status <= 599)") && expoPushClient.includes('maxAttempts = 3') && expoPushClient.includes('maxDelayMs = 4000'));
check('permanent 4xx and ambiguous push sends are not retried', expoPushClient.includes('!error.retryable') && expoPushClient.includes('deliveryUnknown') && adminPush.includes("operation: 'expo_push'"));
check('receipt lookup uses idempotent transient-network retries', receiptProcessor.includes('idempotent: true') && receiptProcessor.includes('receiptResponse.attempts'));

// A real Expo project link is required before a physical-device token can be obtained.
const repositoryProjectId = app.extra?.eas?.projectId;
check('repository has concrete EAS projectId for physical-device verification', typeof repositoryProjectId === 'string' && repositoryProjectId.length > 20);

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error(`APP BATCH 2 NODE 7: BLOCKED (${failed.length} failed checks)`);
  process.exit(1);
}
console.log('APP BATCH 2 NODE 7: PASS');
