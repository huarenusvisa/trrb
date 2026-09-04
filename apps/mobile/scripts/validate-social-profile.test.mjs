import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20260904012615_mobile_social_profile.sql');

test('enforces the one-message request gate in the database', () => {
  assert.match(migration, /for update;/i, 'conversation row must be locked before checking the first message');
  assert.match(migration, /waiting_for_chat_confirmation/);
  assert.match(migration, /confirm_chat_before_reply/);
  assert.match(migration, /old\.status <> 'pending'/);
  assert.match(migration, /new\.status not in \('accepted', 'declined'\)/);
  assert.match(migration, /grant update\(status\) on public\.direct_conversations to authenticated/);
  assert.doesNotMatch(migration, /grant update on public\.direct_conversations to authenticated/);
});

test('keeps private posts and media behind accepted follows', () => {
  assert.match(migration, /private\.can_view_profile_post/);
  assert.match(migration, /f\.status = 'accepted'/);
  assert.match(migration, /'profile-post-media', 'profile-post-media', false/);
  assert.match(migration, /profile post media visible read/);
  assert.match(migration, /storage\.foldername\(name\)/);
});

test('block removes follows and freezes conversations', () => {
  assert.match(migration, /create table if not exists public\.user_blocks/);
  assert.match(migration, /delete from public\.user_follows/);
  assert.match(migration, /set status = 'blocked'/);
  assert.match(migration, /private\.users_are_blocked/);
});

test('mobile screens expose refined profile, custom media and protected messaging', () => {
  const profile = read('app/(tabs)/profile.tsx');
  const settings = read('app/profile-settings.tsx');
  const chat = read('app/chat/[id].tsx');
  const compose = read('app/profile-compose.tsx');
  assert.match(profile, /<ProfileHero/);
  assert.match(profile, /发主页动态/);
  assert.match(settings, /DIY 头像/);
  assert.match(settings, /隐私账号/);
  assert.match(settings, /允许陌生人发起聊天/);
  assert.match(chat, /确认聊天/);
  assert.match(chat, /不能(?:继续|再)发送第二条/);
  assert.match(compose, /mediaTypes: \['images', 'videos'\]/);
});

test('account, message and community states remain actionable on weak networks', () => {
  const panel = read('src/components/AsyncStatePanel.tsx');
  const timeout = read('src/utils/async-state-core.ts');
  const settings = read('app/profile-settings.tsx');
  const notifications = read('app/notifications.tsx');
  const community = read('app/community.tsx');

  assert.match(panel, /accessibilityLiveRegion="polite"/);
  assert.match(panel, /accessibilityRole="button"/);
  assert.match(panel, /minHeight:44/);
  assert.match(timeout, /Promise\.race/);
  assert.match(timeout, /timeoutMs = 12_000/);

  assert.match(settings, /profile-settings-error/);
  assert.match(settings, /useForegroundRetry/);
  assert.match(settings, /重新读取/);
  assert.match(notifications, /notifications-empty/);
  assert.match(notifications, /notifications-error/);
  assert.match(notifications, /useForegroundRetry/);
  assert.match(community, /community-empty/);
  assert.match(community, /community-error/);
  assert.match(community, /发布第一篇/);
});
