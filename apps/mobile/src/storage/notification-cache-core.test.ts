import assert from 'node:assert/strict';
import test from 'node:test';
import { NOTIFICATION_CACHE_MAX_AGE_MS, notificationCacheKey, notificationCacheSnapshot, parseNotificationCache } from './notification-cache-core.ts';

const notification = { id: 'notice-1', user_id: 'user-1', type: 'comment_reply' as const, is_read: false, created_at: '2026-09-05T10:00:00Z' };

test('restores a recent notification page only for its signed-in owner and category', () => {
  const raw = JSON.stringify({ savedAt: 100, userId: 'user-1', category: 'replies', snapshot: { notifications: [notification], nextOffset: 20 } });
  assert.equal(parseNotificationCache(raw, 'user-1', 'replies', 200)?.snapshot.notifications[0].id, 'notice-1');
  assert.equal(parseNotificationCache(raw, 'user-2', 'replies', 200), null);
  assert.equal(parseNotificationCache(raw, 'user-1', 'likes', 200), null);
  assert.equal(parseNotificationCache(raw, 'user-1', 'replies', NOTIFICATION_CACHE_MAX_AGE_MS + 101), null);
  assert.equal(parseNotificationCache(raw, 'user-1', 'replies', 99), null);
});

test('rejects malformed, cross-account and oversized notification cache content', () => {
  const crossAccount = { ...notification, user_id: 'user-2' };
  const malformed = JSON.stringify({ savedAt: 100, userId: 'user-1', category: 'all', snapshot: { notifications: [crossAccount], nextOffset: null } });
  assert.equal(parseNotificationCache(malformed, 'user-1', 'all', 200), null);
  assert.equal(parseNotificationCache('{', 'user-1', 'all', 200), null);
  const many = Array.from({ length: 25 }, (_, index) => ({ ...notification, id: `notice-${index}` }));
  assert.equal(notificationCacheSnapshot(many, 20, 'user-1').notifications.length, 20);
});

test('isolates every account and category storage key', () => {
  assert.notEqual(notificationCacheKey('user-1', 'all'), notificationCacheKey('user-2', 'all'));
  assert.notEqual(notificationCacheKey('user-1', 'all'), notificationCacheKey('user-1', 'likes'));
});
