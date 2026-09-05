import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NotificationCategory, UserNotification } from '../community/notifications';
import { notificationCacheKey, notificationCacheSnapshot, parseNotificationCache } from './notification-cache-core';

export async function readCachedNotifications(userId: string, category: NotificationCategory) {
  const key = notificationCacheKey(userId, category);
  const raw = await AsyncStorage.getItem(key);
  const payload = parseNotificationCache(raw, userId, category);
  if (!payload && raw) await AsyncStorage.removeItem(key);
  return payload?.snapshot || null;
}

export async function cacheNotifications(notifications: UserNotification[], nextOffset: number | null, userId: string, category: NotificationCategory) {
  const snapshot = notificationCacheSnapshot(notifications, nextOffset, userId);
  await AsyncStorage.setItem(notificationCacheKey(userId, category), JSON.stringify({ savedAt: Date.now(), userId, category, snapshot }));
}
