import type { NotificationCategory, UserNotification } from '../community/notifications';

export const NOTIFICATION_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const NOTIFICATION_CACHE_MAX_ITEMS = 20;
const NOTIFICATION_CACHE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const NOTIFICATION_CACHE_PREFIX = 'trrb.notifications.v1';

export type NotificationCacheSnapshot = {
  notifications: UserNotification[];
  nextOffset: number | null;
};

export type NotificationCacheEnvelope = {
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

export type NotificationCacheInspection = {
  payload: NotificationCacheEnvelope | null;
  discardReason: 'expired' | 'invalid' | null;
};

export function inspectNotificationCache(raw: string | null, userId: string, category: NotificationCategory, now = Date.now()): NotificationCacheInspection {
  if (!raw) return { payload: null, discardReason: null };
  if (!userId || !validCategories.has(category)) return { payload: null, discardReason: 'invalid' };
  try {
    const payload = JSON.parse(raw) as NotificationCacheEnvelope;
    if (payload.userId !== userId || payload.category !== category || !Number.isFinite(payload.savedAt)
      || payload.savedAt <= 0 || payload.savedAt > now + NOTIFICATION_CACHE_FUTURE_TOLERANCE_MS) {
      return { payload: null, discardReason: 'invalid' };
    }
    if (now - payload.savedAt > NOTIFICATION_CACHE_MAX_AGE_MS) {
      return { payload: null, discardReason: 'expired' };
    }
    if (!Array.isArray(payload.snapshot?.notifications)
      || payload.snapshot.notifications.length > NOTIFICATION_CACHE_MAX_ITEMS
      || !payload.snapshot.notifications.every((item) => validNotification(item, userId))) {
      return { payload: null, discardReason: 'invalid' };
    }
    if (payload.snapshot.nextOffset !== null
      && (!Number.isInteger(payload.snapshot.nextOffset) || payload.snapshot.nextOffset < 0)) {
      return { payload: null, discardReason: 'invalid' };
    }
    return { payload, discardReason: null };
  } catch {
    return { payload: null, discardReason: 'invalid' };
  }
}

export function parseNotificationCache(raw: string | null, userId: string, category: NotificationCategory, now = Date.now()): NotificationCacheEnvelope | null {
  return inspectNotificationCache(raw, userId, category, now).payload;
}

export function notificationCacheSnapshot(notifications: UserNotification[], nextOffset: number | null, userId: string): NotificationCacheSnapshot {
  return {
    notifications: notifications.filter((item) => validNotification(item, userId)).slice(0, NOTIFICATION_CACHE_MAX_ITEMS),
    nextOffset: nextOffset !== null && Number.isInteger(nextOffset) && nextOffset >= 0 ? nextOffset : null,
  };
}
