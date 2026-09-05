import type { NotificationCategory, UserNotification } from '../community/notifications';

export const NOTIFICATION_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const NOTIFICATION_CACHE_MAX_ITEMS = 20;
const NOTIFICATION_CACHE_PREFIX = 'trrb.notifications.v1';

export type NotificationCacheSnapshot = {
  notifications: UserNotification[];
  nextOffset: number | null;
};

type NotificationCacheEnvelope = {
  savedAt: number;
  userId: string;
  category: NotificationCategory;
  snapshot: NotificationCacheSnapshot;
};

const validCategories = new Set<NotificationCategory>(['all', 'replies', 'likes', 'follows', 'messages', 'moderation']);
const validTypes = new Set([
  'comment_reply', 'comment_like', 'community_reply', 'community_post_like', 'community_comment_like',
  'community_report', 'follow', 'follow_request', 'follow_accept', 'message_request', 'message', 'system',
]);

export function notificationCacheKey(userId: string, category: NotificationCategory) {
  return `${NOTIFICATION_CACHE_PREFIX}.${encodeURIComponent(userId)}.${category}`;
}

function validNotification(item: UserNotification, userId: string) {
  return Boolean(item && String(item.id || '').trim() && item.user_id === userId
    && validTypes.has(item.type) && typeof item.is_read === 'boolean'
    && String(item.created_at || '').trim() && Number.isFinite(Date.parse(item.created_at)));
}

export function parseNotificationCache(raw: string | null, userId: string, category: NotificationCategory, now = Date.now()): NotificationCacheEnvelope | null {
  if (!raw || !userId || !validCategories.has(category)) return null;
  try {
    const payload = JSON.parse(raw) as NotificationCacheEnvelope;
    if (payload.userId !== userId || payload.category !== category || !Number.isFinite(payload.savedAt)
      || payload.savedAt <= 0 || payload.savedAt > now || now - payload.savedAt > NOTIFICATION_CACHE_MAX_AGE_MS) return null;
    if (!Array.isArray(payload.snapshot?.notifications)
      || payload.snapshot.notifications.length > NOTIFICATION_CACHE_MAX_ITEMS
      || !payload.snapshot.notifications.every((item) => validNotification(item, userId))) return null;
    if (payload.snapshot.nextOffset !== null
      && (!Number.isInteger(payload.snapshot.nextOffset) || payload.snapshot.nextOffset < 0)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function notificationCacheSnapshot(notifications: UserNotification[], nextOffset: number | null, userId: string): NotificationCacheSnapshot {
  return {
    notifications: notifications.filter((item) => validNotification(item, userId)).slice(0, NOTIFICATION_CACHE_MAX_ITEMS),
    nextOffset,
  };
}
