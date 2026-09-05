import assert from 'node:assert/strict';
import test from 'node:test';
import { decrementNotificationUnread, normalizeUnreadCounts, unreadBadgeValue, unreadTotal } from './unread-core.ts';

test('normalizes invalid unread counts before calculating the total', () => {
  assert.deepEqual(normalizeUnreadCounts({ notifications: -3, messages: 2.9 }), { notifications: 0, messages: 2 });
  assert.deepEqual(normalizeUnreadCounts({ notifications: Number.NaN, messages: Number.POSITIVE_INFINITY }), { notifications: 0, messages: 0 });
  assert.equal(unreadTotal({ notifications: 4, messages: 3 }), 7);
});

test('formats tab badges without showing a zero or an unbounded number', () => {
  assert.equal(unreadBadgeValue({ notifications: 0, messages: 0 }), undefined);
  assert.equal(unreadBadgeValue({ notifications: 8, messages: 2 }), 10);
  assert.equal(unreadBadgeValue({ notifications: 90, messages: 12 }), '99+');
});

test('optimistic notification reads never make the count negative', () => {
  assert.deepEqual(decrementNotificationUnread({ notifications: 2, messages: 5 }), { notifications: 1, messages: 5 });
  assert.deepEqual(decrementNotificationUnread({ notifications: 0, messages: 5 }), { notifications: 0, messages: 5 });
});
