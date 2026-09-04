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

test('comments, chats and connection lists recover without blank screens', () => {
  const comments = read('app/my-comments.tsx');
  const messages = read('app/messages.tsx');
  const chat = read('app/chat/[id].tsx');
  const connections = read('app/connections/[type].tsx');
  const followRequests = read('app/follow-requests.tsx');

  for (const screen of [comments, messages, chat, connections, followRequests]) {
    assert.match(screen, /AsyncStatePanel/);
    assert.match(screen, /withUiTimeout/);
    assert.match(screen, /useForegroundRetry/);
    assert.match(screen, /重新(?:读取|同步)/);
  }
  assert.match(comments, /my-comments-empty/);
  assert.match(comments, /RefreshControl/);
  assert.match(messages, /messages-error/);
  assert.match(messages, /messages-empty/);
  assert.match(chat, /chat-error/);
  assert.match(chat, /accessibilityLabel="发送消息"/);
  assert.match(connections, /connections-empty/);
  assert.match(followRequests, /follow-requests-empty/);
});

test('user profiles and community post actions expose timeout recovery', () => {
  const userProfile = read('app/user/[id].tsx');
  const communityPost = read('app/community/[id].tsx');

  for (const screen of [userProfile, communityPost]) {
    assert.match(screen, /AsyncStatePanel/);
    assert.match(screen, /withUiTimeout/);
    assert.match(screen, /useForegroundRetry/);
    assert.match(screen, /重试操作/);
    assert.match(screen, /accessibilityRole="button"/);
  }

  assert.match(userProfile, /user-profile-error/);
  assert.match(userProfile, /user-action-feedback/);
  assert.match(userProfile, /关注操作超时/);
  assert.match(userProfile, /解除拉黑失败/);
  assert.match(communityPost, /community-post-error/);
  assert.match(communityPost, /community-action-feedback/);
  assert.match(communityPost, /评论提交超时/);
  assert.match(communityPost, /帖子下架失败/);
});

test('profile post composer restores text drafts and keeps failed uploads retryable', () => {
  const compose = read('app/profile-compose.tsx');
  const drafts = read('src/storage/profilePostDraft.ts');
  const posts = read('src/social/posts.ts');

  assert.match(compose, /loadProfilePostDraft/);
  assert.match(compose, /saveProfilePostDraft/);
  assert.match(compose, /profile-compose-draft-restored/);
  assert.match(compose, /profile-compose-error/);
  assert.match(compose, /重试发布/);
  assert.match(compose, /已选媒体和文字仍保留在本页/);
  assert.match(compose, /accessibilityLiveRegion="polite"/);
  assert.match(drafts, /AsyncStorage\.setItem/);
  assert.match(drafts, /AsyncStorage\.removeItem/);
  assert.match(posts, /onProgress\?/);
  assert.match(posts, /completed: index \+ 1/);
});

test('community composer restores drafts and keeps failed submissions retryable', () => {
  const compose = read('app/community-compose.tsx');
  const drafts = read('src/storage/communityPostDraft.ts');

  assert.match(compose, /loadCommunityPostDraft/);
  assert.match(compose, /saveCommunityPostDraft/);
  assert.match(compose, /community-compose-draft-restored/);
  assert.match(compose, /community-compose-error/);
  assert.match(compose, /重试发布/);
  assert.match(compose, /标题、正文和板块仍保留在本页/);
  assert.match(compose, /accessibilityRole="checkbox"/);
  assert.match(compose, /accessibilityLiveRegion="polite"/);
  assert.match(drafts, /AsyncStorage\.setItem/);
  assert.match(drafts, /AsyncStorage\.removeItem/);
});

test('news and community comments preserve scoped drafts and failed submissions', () => {
  const news = read('src/components/CommentThread.tsx');
  const community = read('app/community/[id].tsx');
  const drafts = read('src/storage/commentDraft.ts');

  for (const screen of [news, community]) {
    assert.match(screen, /loadCommentDraft/);
    assert.match(screen, /saveCommentDraft/);
    assert.match(screen, /clearCommentDraft/);
    assert.match(screen, /draft-restored/);
    assert.match(screen, /草稿自动保存 7 天/);
  }
  assert.match(news, /news-comment-error/);
  assert.match(news, /重试发布/);
  assert.match(news, /parentId: target\?\.id/);
  assert.match(community, /评论提交失败/);
  assert.match(drafts, /scope: CommentDraftScope/);
  assert.match(drafts, /AsyncStorage\.setItem/);
});
