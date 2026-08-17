import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { supabase } from '../auth/supabase';

function articleIdFromNotification(data: Record<string, unknown> | undefined) {
  const value = data?.article_id ?? data?.articleId;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

export function openPushTarget(data: Record<string, unknown> | undefined) {
  const articleId = articleIdFromNotification(data);
  if (articleId) router.push(`/article/${encodeURIComponent(articleId)}` as never);
}

export async function registerPushToken() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('news', {
      name: '新闻推送',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250]
    });
  }

  const permission = await Notifications.getPermissionsAsync();
  let status = permission.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('EAS projectId is not configured for push notifications');

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.id) return null;

  const expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const result = await supabase.from('push_tokens').upsert({
    user_id: auth.user.id,
    platform: Platform.OS,
    expo_push_token: expoPushToken,
    enabled: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,expo_push_token' });
  if (result.error) throw result.error;
  return expoPushToken;
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

  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    openPushTarget(response.notification.request.content.data as Record<string, unknown> | undefined);
  });

  return () => responseSubscription.remove();
}
