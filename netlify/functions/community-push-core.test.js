const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildDeliveryPlan, collapseNotifications, summarizeNotificationOutcomes, uuidInFilter } = require('./community-push-core');

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

test('honors granular interaction preferences and permanently skips users without devices', () => {
  const plan = buildDeliveryPlan([
    { id: 8, user_id: userA, type: 'community_post_like', community_post_id: 'post-1' },
    { id: 9, user_id: userB, type: 'community_report', community_post_id: 'post-2' }
  ], [{ id: 1, user_id: userA, expo_push_token: 'ExponentPushToken[a]', enabled: true }], [
    { user_id: userA, community: false }
  ]);
  assert.deepEqual(plan.targets, []);
  assert.deepEqual(plan.skipped, [
    { id: 8, reason: 'likes_preference_disabled' },
    { id: 9, reason: 'no_active_push_token' }
  ]);
});

test('routes news, follow and private-message notifications through existing targets', () => {
  const plan = buildDeliveryPlan([
    { id: 10, user_id: userA, actor_user_id: userB, type: 'comment_reply', article_id: 'article-1', comment_id: 'comment-1' },
    { id: 11, user_id: userA, actor_user_id: userB, type: 'follow' },
    { id: 12, user_id: userB, actor_user_id: userA, type: 'message', conversation_id: 'conversation-1', body: '你好' }
  ], [
    { id: 1, user_id: userA, expo_push_token: 'ExponentPushToken[a]', enabled: true },
    { id: 2, user_id: userB, expo_push_token: 'ExponentPushToken[b]', enabled: true }
  ], []);
  assert.deepEqual(plan.targets.map((target) => target.message.data), [
    { type: 'comment_reply', actor_user_id: userB, article_id: 'article-1', comment_id: 'comment-1' },
    { type: 'follow', actor_user_id: userB },
    { type: 'message', actor_user_id: userA, conversation_id: 'conversation-1' }
  ]);
  assert.deepEqual(plan.targets.map((target) => target.message.channelId), ['community', 'community', 'messages']);
});

test('coalesces same-type pushes while preserving every in-app notification', () => {
  const result = collapseNotifications([
    { id: 20, user_id: userA, actor_user_id: userB, type: 'message', conversation_id: 'conversation-1', body: '第一条' },
    { id: 21, user_id: userA, actor_user_id: userB, type: 'message', conversation_id: 'conversation-1', body: '第二条' },
    { id: 22, user_id: userA, actor_user_id: userB, type: 'message', conversation_id: 'conversation-2', body: '另一个会话' }
  ]);
  assert.deepEqual(result.deliver.map((item) => [item.id, item.title, item.body]), [
    [21, '你收到 2 条新私信', '第二条'],
    [22, '你收到一条新私信', '另一个会话']
  ]);
  assert.deepEqual(result.skipped, [{ id: 20, reason: 'coalesced_into_newer_notification' }]);
});

test('coalesces multiple replies to the same article and keeps the latest deep link', () => {
  const result = collapseNotifications([
    { id: 23, user_id: userA, type: 'comment_reply', article_id: 'article-1', comment_id: 'reply-1' },
    { id: 24, user_id: userA, type: 'comment_reply', article_id: 'article-1', comment_id: 'reply-2' }
  ]);
  assert.equal(result.deliver.length, 1);
  assert.equal(result.deliver[0].id, 24);
  assert.equal(result.deliver[0].comment_id, 'reply-2');
  assert.equal(result.deliver[0].title, '你收到 2 条新回复');
});

test('private messages remain deliverable when interaction pushes are disabled', () => {
  const plan = buildDeliveryPlan([
    { id: 30, user_id: userA, type: 'message', conversation_id: 'conversation-1' }
  ], [{ id: 1, user_id: userA, expo_push_token: 'ExponentPushToken[a]', enabled: true }], [
    { user_id: userA, community: false }
  ]);
  assert.equal(plan.targets.length, 1);
  assert.deepEqual(plan.skipped, []);
});

test('each interaction category can be disabled without suppressing the others', () => {
  const plan = buildDeliveryPlan([
    { id: 31, user_id: userA, type: 'comment_reply', article_id: 'article-1' },
    { id: 32, user_id: userA, type: 'community_post_like', community_post_id: 'post-1' },
    { id: 33, user_id: userA, type: 'follow', actor_user_id: userB },
    { id: 34, user_id: userA, type: 'message', conversation_id: 'conversation-1' },
    { id: 35, user_id: userA, type: 'community_report', community_post_id: 'post-2' }
  ], [{ id: 1, user_id: userA, expo_push_token: 'ExponentPushToken[a]', enabled: true }], [
    { user_id: userA, community: true, comments: false, likes: true, follows: false, messages: false, moderation: true }
  ]);
  assert.deepEqual(plan.targets.map((target) => target.notification_id), [32, 35]);
  assert.deepEqual(plan.skipped, [
    { id: 31, reason: 'comments_preference_disabled' },
    { id: 33, reason: 'follows_preference_disabled' },
    { id: 34, reason: 'messages_preference_disabled' }
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

test('unified migration keeps claims service-only and links direct-message conversations', () => {
  const migration = fs.readFileSync(path.join(
    __dirname, '../../supabase/migrations/20260905071500_unified_social_push_delivery.sql'
  ), 'utf8');
  const conversationIndex = fs.readFileSync(path.join(
    __dirname, '../../supabase/migrations/20260905073500_index_notification_conversations.sql'
  ), 'utf8');
  assert.match(migration, /claim_interaction_push_notifications/);
  assert.match(migration, /revoke all on function public\.claim_interaction_push_notifications[\s\S]*public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.claim_interaction_push_notifications[\s\S]*service_role/);
  assert.match(migration, /conversation_id uuid[\s\S]*direct_conversations/);
  assert.match(migration, /insert into public\.user_notifications\([\s\S]*conversation_id/);
  assert.match(conversationIndex, /user_notifications_conversation_idx[\s\S]*conversation_id[\s\S]*is not null/);
});

test('granular preference migration preserves the legacy interaction choice', () => {
  const migration = fs.readFileSync(path.join(
    __dirname, '../../supabase/migrations/20260905081500_granular_interaction_push_preferences.sql'
  ), 'utf8');
  assert.match(migration, /add column if not exists comments boolean not null default true/);
  assert.match(migration, /comments = community[\s\S]*likes = community[\s\S]*follows = community/);
  assert.match(migration, /messages boolean not null default true/);
  assert.match(migration, /moderation boolean not null default true/);
  const worker = fs.readFileSync(path.join(__dirname, 'community-push.mjs'), 'utf8');
  assert.match(worker, /select: 'user_id,community,comments,likes,follows,messages,moderation'/);
  const policies = fs.readFileSync(path.join(
    __dirname, '../../supabase/migrations/20260905083500_deduplicate_notification_preference_policies.sql'
  ), 'utf8');
  assert.match(policies, /drop policy if exists "users read own notification preferences"/);
  assert.doesNotMatch(policies, /create policy/);
});

test('mobile registers interaction channels and reads conversation deep links', () => {
  const registration = fs.readFileSync(path.join(__dirname, '../../apps/mobile/src/push/registration.ts'), 'utf8');
  const notifications = fs.readFileSync(path.join(__dirname, '../../apps/mobile/src/community/notifications.ts'), 'utf8');
  const settings = fs.readFileSync(path.join(__dirname, '../../apps/mobile/app/push-settings.tsx'), 'utf8');
  assert.match(registration, /\['community', '互动通知'\]/);
  assert.match(registration, /\['messages', '私信通知'\]/);
  assert.match(notifications, /community_comment_id,conversation_id,is_read/);
  for (const key of ['comments', 'likes', 'follows', 'messages', 'moderation']) {
    assert.match(settings, new RegExp(`key: '${key}'`));
  }
});
