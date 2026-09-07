import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { supabase } from '../auth/supabase';
import { PushResponseGate, pushDestination, shouldRequestPushPermission } from './push-core';
import {
  MAX_PENDING_PUSH_RETRY_DELAY_MS,
  PendingPushRetryTrigger,
  PushConnectivityGate,
  classifyPushRegistrationError,
  nextPendingPushRegistration,
  parsePendingPushRegistration,
  pendingPushRetryDelay,
  pushRegistrationRetryAfterMs,
  parseStoredPushRegistration,
  serializePushRegistration,
  shouldSynchronizePushRegistration,
  stalePushTokensForCurrentUser,
  tokenToDisableForCurrentUser
} from './registration-core';
import { claimPushToken } from './registration-api';

const LEGACY_DEVICE_TOKEN_KEY = '@trrb/push-device-token/v1';
const DEVICE_REGISTRATION_KEY = '@trrb/push-device-registration/v2';
const DEVICE_PUSH_DISABLED_KEY = '@trrb/push-device-disabled/v1';
const PENDING_REGISTRATION_KEY = '@trrb/push-registration-pending/v1';
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
const pushResponseGate = new PushResponseGate();
let registrationSuspended = false;
let tokenMutationQueue: Promise<void> = Promise.resolve();
let pendingRetryTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRetryInFlight: Promise<string | null> | null = null;
export type PendingPushRegistrationStatus = { attempts: number; retryAt: number; errorKind: 'network' | 'server' | 'unknown' };
type PendingPushRegistrationEvent = { status: PendingPushRegistrationStatus | null; reason: 'pending' | 'synced' | 'cleared' };
const pendingRegistrationListeners = new Set<(event: PendingPushRegistrationEvent) => void>();

function publishPendingRegistration(event: PendingPushRegistrationEvent) {
  pendingRegistrationListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.warn('push registration status listener failed', error);
    }
  });
}

export function subscribeToPendingPushRegistration(listener: (event: PendingPushRegistrationEvent) => void) {
  pendingRegistrationListeners.add(listener);
  return () => pendingRegistrationListeners.delete(listener);
}

function clearPendingRetryTimer() {
  if (pendingRetryTimer) clearTimeout(pendingRetryTimer);
  pendingRetryTimer = null;
}

function schedulePendingRetry(delayMs: number) {
  clearPendingRetryTimer();
  pendingRetryTimer = setTimeout(() => {
    pendingRetryTimer = null;
    if (!registrationSuspended) void registerPushToken().catch((error) => console.warn('push token retry failed', error));
  }, Math.max(0, Math.min(MAX_PENDING_PUSH_RETRY_DELAY_MS, delayMs)));
}

async function clearPendingRegistration(reason: 'synced' | 'cleared' = 'cleared') {
  clearPendingRetryTimer();
  await AsyncStorage.removeItem(PENDING_REGISTRATION_KEY);
  publishPendingRegistration({ status: null, reason });
}

function enqueueTokenMutation<T>(mutation: () => Promise<T>) {
  const result = tokenMutationQueue.then(mutation, mutation);
  tokenMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function openPushTarget(data: Record<string, unknown> | undefined) {
  router.push(pushDestination(data) as never);
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Promise.all([
    ['news', '新闻推送'],
    ['community', '互动通知'],
    ['messages', '私信通知']
  ].map(([id, name]) => Notifications.setNotificationChannelAsync(id, {
    name,
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250]
  })));
}

export async function getPushPermissionStatus() {
  if (!isNative) return { status: 'denied' as const, canAskAgain: false };
  const permission = await Notifications.getPermissionsAsync();
  return { status: permission.status, canAskAgain: permission.canAskAgain };
}

export async function hasCurrentDevicePushToken() {
  if (!isNative) return false;
  const [registration, legacyToken, disabled] = await Promise.all([
    AsyncStorage.getItem(DEVICE_REGISTRATION_KEY),
    AsyncStorage.getItem(LEGACY_DEVICE_TOKEN_KEY),
    AsyncStorage.getItem(DEVICE_PUSH_DISABLED_KEY)
  ]);
  return disabled !== 'true' && Boolean(parseStoredPushRegistration(registration) || legacyToken?.trim());
}

export async function getPendingPushRegistrationStatus() {
  if (!isNative) return null;
  const pendingRaw = await AsyncStorage.getItem(PENDING_REGISTRATION_KEY);
  if (!pendingRaw) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const pending = parsePendingPushRegistration(pendingRaw);
  const userId = sessionData.session?.user.id;
  if (!userId || !pending || pending.userId !== userId) return null;
  return { attempts: pending.attempts, retryAt: pending.retryAt, errorKind: pending.errorKind };
}

async function performRegisterPushToken(options: { requestPermission?: boolean; devicePushToken?: Notifications.DevicePushToken; retryTrigger?: PendingPushRetryTrigger } = {}) {
  if (!isNative) return null;

  const deviceDisabled = await AsyncStorage.getItem(DEVICE_PUSH_DISABLED_KEY) === 'true';
  if (registrationSuspended || !shouldSynchronizePushRegistration(deviceDisabled, options.requestPermission === true)) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const userId = sessionData.session?.user.id;
  if (!accessToken || !userId) return null;

  const pendingRaw = await AsyncStorage.getItem(PENDING_REGISTRATION_KEY);
  const pendingDelay = pendingPushRetryDelay(pendingRaw, userId, Date.now(), options.retryTrigger);
  if (options.retryTrigger && pendingDelay === null) return null;
  if (options.requestPermission !== true && !options.devicePushToken && pendingDelay !== null && pendingDelay > 0) {
    schedulePendingRetry(pendingDelay);
    return null;
  }

  await ensureAndroidChannel();

  const permission = await Notifications.getPermissionsAsync();
  let status = permission.status;
  if (shouldRequestPushPermission(status, options.requestPermission === true)) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    await clearPendingRegistration();
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('EAS projectId is not configured for push notifications');

  const [storedRegistrationRaw, legacyToken] = await Promise.all([
    AsyncStorage.getItem(DEVICE_REGISTRATION_KEY),
    AsyncStorage.getItem(LEGACY_DEVICE_TOKEN_KEY)
  ]);
  const storedRegistration = parseStoredPushRegistration(storedRegistrationRaw);
  let expoPushToken: string | null = null;
  try {
    expoPushToken = (await Notifications.getExpoPushTokenAsync({
      projectId,
      ...(options.devicePushToken ? { devicePushToken: options.devicePushToken } : {})
    })).data;
    const claim = await claimPushToken({
      accessToken,
      platform: Platform.OS as 'ios' | 'android',
      expoPushToken
    });
    if (claim.userId !== userId) throw new Error('推送令牌账号校验失败');

    const staleTokens = stalePushTokensForCurrentUser(userId, expoPushToken, storedRegistration, legacyToken);
    if (staleTokens.length) {
      const cleanup = await supabase.from('push_tokens').update({
        enabled: false,
        updated_at: new Date().toISOString()
      }).eq('user_id', userId).in('expo_push_token', staleTokens);
      if (cleanup.error) throw cleanup.error;
    }

    await AsyncStorage.multiSet([
      [DEVICE_REGISTRATION_KEY, serializePushRegistration(userId, Platform.OS as 'ios' | 'android', expoPushToken)],
      [DEVICE_PUSH_DISABLED_KEY, 'false']
    ]);
    await Promise.all([
      AsyncStorage.removeItem(LEGACY_DEVICE_TOKEN_KEY),
      clearPendingRegistration('synced')
    ]);
    return expoPushToken;
  } catch (error) {
    const nextPendingRaw = nextPendingPushRegistration(
      pendingRaw,
      userId,
      Platform.OS as 'ios' | 'android',
      expoPushToken,
      Date.now(),
      classifyPushRegistrationError(error),
      pushRegistrationRetryAfterMs(error)
    );
    await AsyncStorage.setItem(PENDING_REGISTRATION_KEY, nextPendingRaw);
    const nextPending = parsePendingPushRegistration(nextPendingRaw);
    if (nextPending) publishPendingRegistration({
      status: { attempts: nextPending.attempts, retryAt: nextPending.retryAt, errorKind: nextPending.errorKind },
      reason: 'pending'
    });
    schedulePendingRetry(pendingPushRetryDelay(nextPendingRaw, userId) ?? MAX_PENDING_PUSH_RETRY_DELAY_MS);
    throw error;
  }
}

export function registerPushToken(options: { requestPermission?: boolean; devicePushToken?: Notifications.DevicePushToken } = {}) {
  if (options.requestPermission === true) registrationSuspended = false;
  return enqueueTokenMutation(() => performRegisterPushToken(options));
}

function retryPendingPushRegistrationForTrigger(trigger: 'manual' | 'foreground' | 'network') {
  if (pendingRetryInFlight) return pendingRetryInFlight;
  registrationSuspended = false;
  const retry = enqueueTokenMutation(() => performRegisterPushToken({ retryTrigger: trigger }));
  pendingRetryInFlight = retry;
  void retry.finally(() => {
    if (pendingRetryInFlight === retry) pendingRetryInFlight = null;
  }).catch(() => {});
  return retry;
}

export function retryPendingPushRegistration() {
  return retryPendingPushRegistrationForTrigger('manual');
}

async function performDisableCurrentDevicePushToken(rememberDeviceChoice: boolean) {
  if (!isNative) return;
  await clearPendingRegistration();
  const rememberDisabledChoice = async () => {
    if (rememberDeviceChoice) await AsyncStorage.setItem(DEVICE_PUSH_DISABLED_KEY, 'true');
  };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.id) return rememberDisabledChoice();

  const [storedRegistrationRaw, legacyToken] = await Promise.all([
    AsyncStorage.getItem(DEVICE_REGISTRATION_KEY),
    AsyncStorage.getItem(LEGACY_DEVICE_TOKEN_KEY)
  ]);
  const storedRegistration = parseStoredPushRegistration(storedRegistrationRaw);
  let liveToken: string | null = null;
  let token = tokenToDisableForCurrentUser(auth.user.id, storedRegistration, legacyToken, null);
  if (!token) {
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted') return rememberDisabledChoice();
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return rememberDisabledChoice();
    liveToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    token = tokenToDisableForCurrentUser(auth.user.id, storedRegistration, legacyToken, liveToken);
  }
  if (!token) return;

  const result = await supabase.from('push_tokens').update({
    enabled: false,
    updated_at: new Date().toISOString()
  }).eq('user_id', auth.user.id).eq('expo_push_token', token);
  if (result.error) throw result.error;
  if (storedRegistration?.userId === auth.user.id) await AsyncStorage.removeItem(DEVICE_REGISTRATION_KEY);
  if (legacyToken?.trim() === token) await AsyncStorage.removeItem(LEGACY_DEVICE_TOKEN_KEY);
  await rememberDisabledChoice();
}

export function disableCurrentDevicePushToken(options: { rememberDeviceChoice?: boolean } = {}) {
  registrationSuspended = true;
  clearPendingRetryTimer();
  return enqueueTokenMutation(() => performDisableCurrentDevicePushToken(options.rememberDeviceChoice === true));
}

export function installPushRegistrationLifecycle() {
  const sync = (devicePushToken?: Notifications.DevicePushToken) => void registerPushToken({ devicePushToken }).catch((error) => console.warn('push token sync failed', error));
  const retryPending = async (trigger: 'foreground' | 'network') => {
    if (registrationSuspended || !await AsyncStorage.getItem(PENDING_REGISTRATION_KEY)) return;
    await retryPendingPushRegistrationForTrigger(trigger);
  };
  const connectivityGate = new PushConnectivityGate();
  sync();
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      registrationSuspended = false;
      setTimeout(sync, 0);
    }
  });
  const tokenSubscription = isNative ? Notifications.addPushTokenListener((token) => {
    if (!registrationSuspended) sync(token);
  }) : null;
  const appStateSubscription = isNative ? AppState.addEventListener('change', (state) => {
    if (state === 'active') void retryPending('foreground').catch((error) => console.warn('push token pending retry failed', error));
  }) : null;
  const networkSubscription = isNative ? Network.addNetworkStateListener((state) => {
    if (connectivityGate.record(state)) void retryPending('network').catch((error) => console.warn('push token network recovery retry failed', error));
  }) : null;
  return () => {
    data.subscription.unsubscribe();
    tokenSubscription?.remove();
    appStateSubscription?.remove();
    networkSubscription?.remove();
    clearPendingRetryTimer();
  };
}

export function installPushRuntimeHandlers() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false
    })
  });

  const handleResponse = (response: Notifications.NotificationResponse | null) => {
    if (!response || !pushResponseGate.claim(response.notification.request.identifier)) return;
    void Notifications.clearLastNotificationResponseAsync().catch((error) => console.warn('push response cleanup failed', error));
    setTimeout(() => {
      openPushTarget(response.notification.request.content.data as Record<string, unknown> | undefined);
    }, 0);
  };

  handleResponse(Notifications.getLastNotificationResponse());
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

  return () => responseSubscription.remove();
}
