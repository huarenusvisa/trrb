import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { supabase } from '../auth/supabase';
import { pushTargetPath, shouldRequestPushPermission } from './push-core';

const DEVICE_TOKEN_KEY = '@trrb/push-device-token/v1';
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

export function openPushTarget(data: Record<string, unknown> | undefined) {
  const path = pushTargetPath(data);
  if (path) router.push(path as never);
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('news', {
    name: '新闻推送',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250]
  });
}

export async function getPushPermissionStatus() {
  if (!isNative) return { status: 'denied' as const, canAskAgain: false };
  const permission = await Notifications.getPermissionsAsync();
  return { status: permission.status, canAskAgain: permission.canAskAgain };
}

export async function hasCurrentDevicePushToken() {
  return isNative && Boolean(await AsyncStorage.getItem(DEVICE_TOKEN_KEY));
}

export async function registerPushToken(options: { requestPermission?: boolean } = {}) {
  if (!isNative) return null;

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.id) return null;

  await ensureAndroidChannel();

  const permission = await Notifications.getPermissionsAsync();
  let status = permission.status;
  if (shouldRequestPushPermission(status, options.requestPermission === true)) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('EAS projectId is not configured for push notifications');

  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const result = await supabase.from('push_tokens').upsert({
    user_id: auth.user.id,
    platform: Platform.OS,
    expo_push_token: expoPushToken,
    enabled: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,expo_push_token' });
  if (result.error) throw result.error;
  await AsyncStorage.setItem(DEVICE_TOKEN_KEY, expoPushToken);
  return expoPushToken;
}

export async function disableCurrentDevicePushToken() {
  if (!isNative) return;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.id) return;

  let token = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  }

  const result = await supabase.from('push_tokens').update({
    enabled: false,
    updated_at: new Date().toISOString()
  }).eq('user_id', auth.user.id).eq('expo_push_token', token);
  if (result.error) throw result.error;
  await AsyncStorage.removeItem(DEVICE_TOKEN_KEY);
}

export function installPushRegistrationLifecycle() {
  const sync = () => void registerPushToken().catch((error) => console.warn('push token sync failed', error));
  sync();
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) setTimeout(sync, 0);
  });
  return () => data.subscription.unsubscribe();
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

  let lastHandledIdentifier: string | null = null;
  const handleResponse = (response: Notifications.NotificationResponse | null) => {
    if (!response || response.notification.request.identifier === lastHandledIdentifier) return;
    lastHandledIdentifier = response.notification.request.identifier;
    openPushTarget(response.notification.request.content.data as Record<string, unknown> | undefined);
  };

  handleResponse(Notifications.getLastNotificationResponse());
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);

  return () => responseSubscription.remove();
}
