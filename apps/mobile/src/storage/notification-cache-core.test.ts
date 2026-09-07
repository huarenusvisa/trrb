import assert from 'node:assert/strict';
import test from 'node:test';
import { NOTIFICATION_CACHE_MAX_AGE_MS, NOTIFICATION_CACHE_MAX_ITEMS, inspectNotificationCache, notificationCacheKey, notificationCacheSnapshot, parseNotificationCache } from './notification-cache-core.ts';

const notification = { id: 'notice-1', user_id: 'user-1', type: 'comment_reply' as const, is_read: false, created_at: '2026-09-05T10:00:00Z' };

test('restores a recent notification page only for its signed-in owner and category', () => {
  const raw = JSON.stringify({ savedAt: 100, userId: 'user-1', category: 'replies', snapshot: { notifications: [notification], nextOffset: 20 } });
  assert.equal(parseNotificationCache(raw, 'user-1', 'replies', 200)?.snapshot.notifications[0].id, 'notice-1');
  assert.equal(parseNotificationCache(raw, 'user-2', 'replies', 200), null);
  assert.equal(parseNotificationCache(raw, 'user-1', 'likes', 200), null);
  assert.equal(parseNotificationCache(raw, 'user-1', 'replies', NOTIFICATION_CACHE_MAX_AGE_MS + 101), null);
  assert.equal(parseNotificationCache(raw, 'user-1', 'replies', 99)?.savedAt, 100);
});

test('classifies expired notification cache separately from invalid content', () => {
  const now = 20_000_000_000;
  const expired = JSON.stringify({ savedAt: now - NOTIFICATION_CACHE_MAX_AGE_MS - 1, userId: 'user-1', category: 'all', snapshot: { notifications: [notification], nextOffset: null } });
  const future = JSON.stringify({ savedAt: now + 10 * 60 * 1000, userId: 'user-1', category: 'all', snapshot: { notifications: [notification], nextOffset: null } });

  assert.deepEqual(inspectNotificationCache(expired, 'user-1', 'all', now), { payload: null, discardReason: 'expired' });
  assert.deepEqual(inspectNotificationCache(future, 'user-1', 'all', now), { payload: null, discardReason: 'invalid' });
  assert.deepEqual(inspectNotificationCache(null, 'user-1', 'all', now), { payload: null, discardReason: null });
});

test('rejects malformed, cross-account and oversized notification cache content', () => {
  const crossAccount = { ...notification, user_id: 'user-2' };
  const malformed = JSON.stringify({ savedAt: 100, userId: 'user-1', category: 'all', snapshot: { notifications: [crossAccount], nextOffset: null } });
  assert.equal(parseNotificationCache(malformed, 'user-1', 'all', 200), null);
  assert.equal(parseNotificationCache('{', 'user-1', 'all', 200), null);
  const many = Array.from({ length: NOTIFICATION_CACHE_MAX_ITEMS + 5 }, (_, index) => ({ ...notification, id: `notice-${index}` }));
  const bounded = notificationCacheSnapshot([...many, many[0]], 80, 'user-1');
  assert.equal(bounded.notifications.length, NOTIFICATION_CACHE_MAX_ITEMS);
  assert.equal(bounded.nextOffset, null);
  assert.equal(bounded.truncated, true);
  assert.equal(notificationCacheSnapshot([notification], -1, 'user-1').nextOffset, null);
});

test('accepts compatible pagination metadata but rejects inconsistent truncation state', () => {
  const current = JSON.stringify({ savedAt: 100, userId: 'user-1', category: 'all', snapshot: { notifications: [notification], nextOffset: 20, truncated: false } });
  const invalid = JSON.stringify({ savedAt: 100, userId: 'user-1', category: 'all', snapshot: { notifications: [notification], nextOffset: 20, truncated: true } });
  assert.equal(parseNotificationCache(current, 'user-1', 'all', 200)?.snapshot.nextOffset, 20);
  assert.equal(parseNotificationCache(invalid, 'user-1', 'all', 200), null);
});

test('isolates every account and category storage key', () => {
  assert.notEqual(notificationCacheKey('user-1', 'all'), notificationCacheKey('user-2', 'all'));
  assert.notEqual(notificationCacheKey('user-1', 'all'), notificationCacheKey('user-1', 'likes'));
});
