const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildDeliveryPlan, summarizeNotificationOutcomes, uuidInFilter } = require('./community-push-core');

const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';

test('builds community deep-link messages and one target per active device', () => {
  const plan = buildDeliveryPlan([
    { id: 7, user_id: userA, type: 'community_reply', title: '回复', body: '正文', community_post_id: 'post-1', community_comment_id: 'comment-2' }
  ], [
    { id: 1, user_id: userA, expo_push_token: 'ExponentPushToken[a]', enabled: true },
    { id: 2, user_id: userA, expo_push_token: 'ExponentPushToken[b]', enabled: true }
  ], []);
  assert.equal(plan.targets.length, 2);
  assert.deepEqual(plan.targets[0].message.data, {
    type: 'community_reply', community_post_id: 'post-1', community_comment_id: 'comment-2'
  });
  assert.deepEqual(plan.skipped, []);
});

test('honors community preferences and permanently skips users without devices', () => {
  const plan = buildDeliveryPlan([
    { id: 8, user_id: userA, type: 'community_post_like', community_post_id: 'post-1' },
    { id: 9, user_id: userB, type: 'community_report', community_post_id: 'post-2' }
  ], [{ id: 1, user_id: userA, expo_push_token: 'ExponentPushToken[a]', enabled: true }], [
    { user_id: userA, community: false }
  ]);
  assert.deepEqual(plan.targets, []);
  assert.deepEqual(plan.skipped, [
    { id: 8, reason: 'community_preference_disabled' },
    { id: 9, reason: 'no_active_push_token' }
  ]);
});

test('summarizes multi-device Expo ticket outcomes per notification', () => {
  const result = summarizeNotificationOutcomes([
    { notification_id: 10 }, { notification_id: 10 }, { notification_id: 11 }
  ], [
    { status: 'ok', id: 'ticket-a' },
    { status: 'error', details: { error: 'DeviceNotRegistered' } },
    { status: 'error', details: { error: 'MessageTooBig' } }
  ]);
  assert.deepEqual(result, [
    { id: 10, accepted: 1, rejected: 1 },
    { id: 11, accepted: 0, rejected: 1 }
  ]);
});

test('builds injection-safe UUID filters', () => {
  assert.equal(uuidInFilter([userA, userA.toUpperCase(), 'bad),id.eq.1']), `in.(${userA})`);
  assert.equal(uuidInFilter([]), null);
});

test('migration skips historical notifications before enabling the pending default', () => {
  const migration = fs.readFileSync(path.join(
    __dirname, '../../supabase/migrations/20260905061500_community_interaction_push_delivery.sql'
  ), 'utf8');
  const backfill = migration.indexOf("push_status = 'skipped'");
  const pendingDefault = migration.indexOf("push_status set default 'pending'");
  assert.ok(backfill >= 0 && pendingDefault > backfill);
  assert.match(migration, /created_before_push_delivery/);
});
