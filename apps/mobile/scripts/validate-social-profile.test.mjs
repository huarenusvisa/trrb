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
  assert.match(profile, /profile-compose/);
  assert.match(settings, /t\('profileSettings\.customAvatar'\)/);
  assert.match(settings, /t\('profileSettings\.privateAccount'\)/);
  assert.match(settings, /t\('profileSettings\.allowMessages'\)/);
  assert.match(chat, /t\('chat\.accept'\)/);
  assert.match(chat, /t\('chat\.incomingBody'\)/);
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
  assert.match(settings, /t\('profileSettings\.reload'\)/);
  assert.match(notifications, /notifications-empty/);
  assert.match(notifications, /notifications-error/);
  assert.match(notifications, /useForegroundRetry/);
  assert.match(community, /community-empty/);
  assert.match(community, /community-error/);
  assert.match(community, /t\('community\.publishFirst'\)/);
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
  }
  assert.match(comments, /t\('myComments\.reload'\)/);
  assert.match(followRequests, /t\('followRequests\.reload'\)/);
  assert.match(comments, /my-comments-empty/);
  assert.match(comments, /RefreshControl/);
  assert.match(messages, /messages-error/);
  assert.match(messages, /messages-empty/);
  assert.match(messages, /t\('messages\.reload'\)/);
  assert.match(chat, /chat-error/);
  assert.match(chat, /t\('chat\.reload'\)/);
  assert.match(chat, /accessibilityLabel=\{t\('chat\.sendA11y'\)\}/);
  assert.match(connections, /connections-empty/);
  assert.match(connections, /t\('connections\.reload'\)/);
  assert.match(followRequests, /follow-requests-empty/);
});

test('global unread counts synchronize the profile tab and native app badge', () => {
  const root = read('app/_layout.tsx');
  const tabs = read('app/(tabs)/_layout.tsx');
  const provider = read('src/notifications/UnreadProvider.tsx');
  const notifications = read('app/notifications.tsx');
  const chat = read('app/chat/[id].tsx');

  assert.match(root, /<UnreadProvider>/);
  assert.match(tabs, /tabBarBadge: profileBadge/);
  assert.match(provider, /unreadNotificationCount\(\)/);
  assert.match(provider, /unreadDirectMessageCount\(\)/);
  assert.match(provider, /setBadgeCountAsync\(total\)/);
  assert.match(provider, /addNotificationReceivedListener/);
  assert.match(provider, /state === 'active'/);
  assert.match(provider, /event === 'SIGNED_OUT'/);
  assert.match(notifications, /markNotificationReadLocally/);
  assert.match(notifications, /markAllNotificationsReadLocally/);
  assert.match(chat, /markConversationRead/);
  assert.match(chat, /unread\.refresh/);
});

test('notification center filters categories and marks only the active category read', () => {
  const screen = read('app/notifications.tsx');
  const api = read('src/community/notifications.ts');
  const provider = read('src/notifications/UnreadProvider.tsx');

  assert.match(screen, /notificationCategories\.map/);
  assert.match(screen, /accessibilityRole="tab"/);
  assert.match(screen, /accessibilityState=\{\{ selected:/);
  assert.match(screen, /listNotifications\(0, PAGE_SIZE, category\)/);
  assert.match(screen, /markAllNotificationsRead\(category\)/);
  assert.match(screen, /unread\.refresh\(\)/);
  assert.match(screen, /t\('inbox\.markCategory'\)/);
  assert.match(screen, /requestId\.current/);
  assert.match(api, /notificationTypesForCategory\(category\)/);
  assert.match(api, /query\.in\('type', types\)/);
  assert.match(provider, /markNotificationsReadLocally/);
});

test('notification center pages older messages and restores account-scoped offline cache', () => {
  const screen = read('app/notifications.tsx');
  const api = read('src/community/notifications.ts');
  const cache = read('src/storage/notification-cache-core.ts');

  assert.match(screen, /notifications-load-more/);
  assert.match(screen, /notifications-page-error/);
  assert.match(screen, /notifications-offline-cache/);
  assert.match(screen, /readCachedNotifications\(userId, category\)/);
  assert.match(screen, /listNotifications\(nextOffset, PAGE_SIZE, category\)/);
  assert.match(screen, /new Set\(current\.map\(\(item\) => item\.id\)\)/);
  assert.match(api, /\.range\(safeOffset, safeOffset \+ safeLimit\)/);
  assert.match(api, /rows\.length > safeLimit/);
  assert.match(cache, /payload\.userId !== userId/);
  assert.match(cache, /payload\.category !== category/);
  assert.match(cache, /NOTIFICATION_CACHE_MAX_AGE_MS/);
  assert.match(cache, /NOTIFICATION_CACHE_MAX_ITEMS/);
});

test('user profiles and community post actions expose timeout recovery', () => {
  const userProfile = read('app/user/[id].tsx');
  const communityPost = read('app/community/[id].tsx');

  for (const screen of [userProfile, communityPost]) {
    assert.match(screen, /AsyncStatePanel/);
    assert.match(screen, /withUiTimeout/);
    assert.match(screen, /useForegroundRetry/);
    assert.match(screen, /accessibilityRole="button"/);
  }

  assert.match(userProfile, /user-profile-error/);
  assert.match(userProfile, /user-action-feedback/);
  assert.match(userProfile, /t\('userProfile\.followTimeout'\)/);
  assert.match(userProfile, /t\('userProfile\.unblockFailed'\)/);
  assert.match(userProfile, /t\('userProfile\.retryAction'\)/);
  assert.match(communityPost, /community-post-error/);
  assert.match(communityPost, /community-action-feedback/);
  assert.match(communityPost, /t\('community\.retryAction'\)/);
  assert.match(communityPost, /t\('community\.commentSubmitTimeout'\)/);
  assert.match(communityPost, /t\('community\.unpublishPostFailed'\)/);
});

test('profile post composer restores text drafts and keeps failed uploads retryable', () => {
  const compose = read('app/profile-compose.tsx');
  const drafts = read('src/storage/profilePostDraft.ts');
  const posts = read('src/social/posts.ts');

  assert.match(compose, /loadProfilePostDraft/);
  assert.match(compose, /saveProfilePostDraft/);
  assert.match(compose, /profile-compose-draft-restored/);
  assert.match(compose, /profile-compose-error/);
  assert.match(compose, /t\('profileCompose\.retry'\)/);
  assert.match(compose, /t\('profileCompose\.failurePreserved'\)/);
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
  assert.match(compose, /t\('communityCompose\.retry'\)/);
  assert.match(compose, /t\('communityCompose\.failurePreserved'\)/);
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
  }
  assert.match(news, /t\('comments\.draftCounter'/);
  assert.match(community, /t\('community\.draftCounter'/);
  assert.match(news, /news-comment-error/);
  assert.match(news, /t\('comments\.retryPublish'\)/);
  assert.match(news, /parentId: target\?\.id/);
  assert.match(community, /t\('community\.commentSubmitFailed'\)/);
  assert.match(drafts, /scope: CommentDraftScope/);
  assert.match(drafts, /AsyncStorage\.setItem/);
});

test('news comment lists distinguish empty, failed and pagination states', () => {
  const news = read('src/components/CommentThread.tsx');

  assert.match(news, /news-comments-load-error/);
  assert.match(news, /news-comments-more-error/);
  assert.match(news, /news-comments-empty/);
  assert.match(news, /withUiTimeout\(listComments/);
  assert.match(news, /useForegroundRetry\(Boolean\(loadError\)/);
  assert.match(news, /t\('comments\.loadedPreserved'\)/);
  assert.match(news, /t\('comments\.reload'\)/);
  assert.match(news, /t\('comments\.retryMore'\)/);
  assert.doesNotMatch(news, /if \(!append\) setItems\(\[\]\)/);
});

test('news comment actions keep failures retryable without losing report input', () => {
  const news = read('src/components/CommentThread.tsx');

  assert.match(news, /news-comment-like-error/);
  assert.match(news, /news-comment-report-error/);
  assert.match(news, /news-comment-delete-error/);
  assert.match(news, /'comments\.retryLike'/);
  assert.match(news, /t\('comments\.retryReport'\)/);
  assert.match(news, /'comments\.retryDelete'/);
  assert.match(news, /t\('comments\.reportReasonPreserved'\)/);
  assert.match(news, /withUiTimeout\(nextLiked \? likeComment/);
  assert.match(news, /withUiTimeout\(reportComment/);
  assert.match(news, /withUiTimeout\(deleteOwnComment/);
  assert.match(news, /current\.filter\(\(item\) => item\.id !== comment\.id\)/);
  assert.doesNotMatch(news, /Alert\.alert\('点赞失败'/);
  assert.doesNotMatch(news, /Alert\.alert\('举报失败'/);
  assert.doesNotMatch(news, /Alert\.alert\('删除失败'/);
});

test('news comments show counts and toggle the signed-in viewer like state', () => {
  const news = read('src/components/CommentThread.tsx');
  const api = read('src/api/comments.ts');

  assert.match(api, /comment_likes\(count\)/);
  assert.match(api, /select\('comment_id'\)\.eq\('user_id'/);
  assert.match(news, /unlikeComment/);
  assert.match(news, /updateCommentLikeState/);
  assert.match(news, /item\.viewer_has_liked \? 'comments\.unlikeA11y' : 'comments\.likeA11y'/);
  assert.match(news, /selected: item\.viewer_has_liked/);
  assert.match(news, /'comments\.liked' : 'comments\.unliked'/);
});

test('news replies stay grouped with parents and identify the reply target', () => {
  const news = read('src/components/CommentThread.tsx');
  const api = read('src/api/comments.ts');
  const presentation = read('src/community/comment-presentation.ts');

  assert.match(api, /missingParentIds/);
  assert.match(api, /profiles!comments_user_id_fkey\(display_name/);
  assert.equal((api.match(/profiles!comments_user_id_fkey/g) || []).length, 2);
  assert.match(api, /parent_author_name/);
  assert.match(presentation, /buildCommentDisplayRows/);
  assert.match(presentation, /for \(const child of children\.get\(row\.id\) \|\| \[\]\) append/);
  assert.match(news, /displayItems\.map\(\(\{ item, depth, replyToLabel \}/);
  assert.match(news, /t\('comments\.replyingTo'/);
  assert.match(news, /styles\.replyComment/);
});

test('community comments refresh without clearing visible content', () => {
  const screen = read('app/community/[id].tsx');
  const presentation = read('src/community/community-comment-presentation.ts');

  assert.match(screen, /RefreshControl/);
  assert.match(screen, /community-refresh-error/);
  assert.match(screen, /t\('community\.refreshFailedTitle'\)/);
  assert.match(screen, /appendCreatedCommunityComment/);
  assert.match(screen, /void refresh\(\)/);
  assert.doesNotMatch(screen, /await load\(\);/);
  assert.match(presentation, /comment_count: pending \? detail\.post\.comment_count/);
  assert.match(presentation, /detail\.comments\.some/);
});

test('community comment authors can soft-unpublish with retry and immediate count sync', () => {
  const screen = read('app/community/[id].tsx');
  const api = read('src/api/community-core.ts');
  const presentation = read('src/community/community-comment-presentation.ts');
  const server = read('../../netlify/functions/community-api.js');

  assert.match(screen, /community-comment-unpublish-/);
  assert.match(screen, /viewerUserId === item\.user_id/);
  assert.match(screen, /t\('community\.unpublishCommentFailed'\)/);
  assert.match(screen, /removeUnpublishedCommunityComment/);
  assert.match(api, /action: 'unpublish_comment'/);
  assert.match(presentation, /comment_count: Math\.max\(0, commentCount\)/);
  assert.match(server, /comment\.user_id !== user\.id/);
  assert.match(server, /body: \{ status: 'deleted'/);
  assert.match(server, /row\.status !== 'deleted'/);
});

test('community posts hydrate and preserve the signed-in viewer like state', () => {
  const list = read('app/community.tsx');
  const detail = read('app/community/[id].tsx');
  const api = read('src/api/community-core.ts');
  const server = read('../../netlify/functions/community-api.js');

  assert.match(server, /community_post_likes/);
  assert.match(server, /post_id: `in\.\(\$\{posts\.map/);
  assert.match(server, /withViewerLikeState/);
  assert.match(api, /viewer_has_liked: boolean/);
  assert.match(list, /post\.viewer_has_liked \? 'community\.likedCount' : 'community\.likeCount'/);
  assert.match(detail, /viewer_has_liked: result\.liked/);
  assert.match(detail, /selected: post\.viewer_has_liked/);
  assert.match(detail, /post\.viewer_has_liked \? 'community\.unlikeA11y' : 'community\.likeA11y'/);
});

test('community list likes optimistically update, roll back and remain retryable', () => {
  const list = read('app/community.tsx');
  const state = read('src/community/community-post-like-state.ts');

  assert.match(list, /community-list-like-/);
  assert.match(list, /optimisticCommunityPostLike/);
  assert.match(list, /resolveCommunityPostLike/);
  assert.match(list, /\.\.\.item, \.\.\.previous/);
  assert.match(list, /community-list-like-error-/);
  assert.match(list, /t\('community\.retryLikeA11y'\)/);
  assert.match(list, /selected: post\.viewer_has_liked/);
  assert.match(list, /toggleCommunityPostLike\(post\.id, !post\.viewer_has_liked\)/);
  assert.match(list, /if \(!signedIn\) \{ router\.push\('\/auth'\)/);
  assert.match(state, /Math\.max\(0/);
  assert.match(read('../../netlify/functions/community-api.js'), /resolveLikeMutation/);
});

test('community feed paginates and restores only public cached posts', () => {
  const list = read('app/community.tsx');
  const api = read('src/api/community-core.ts');
  const cache = read('src/storage/communityFeedCache.ts');
  const cacheCore = read('src/storage/community-feed-cache-core.ts');
  const server = read('../../netlify/functions/community-api.js');

  assert.match(list, /const PAGE_SIZE = 20/);
  assert.match(list, /readCachedCommunityFeed/);
  assert.match(list, /cacheCommunityFeed\(page\.posts, page\.nextOffset, category\)/);
  assert.match(list, /community-load-more/);
  assert.match(list, /community-page-error/);
  assert.match(list, /known = new Set/);
  assert.match(api, /\?offset=\$\{safeOffset\}&limit=\$\{safeLimit\}/);
  assert.match(cache, /AsyncStorage\.setItem/);
  assert.match(cacheCore, /post\.status === 'published'/);
  assert.match(cacheCore, /COMMUNITY_FEED_CACHE_MAX_AGE_MS/);
  assert.match(server, /page\.limit \+ 1/);
  assert.match(server, /order: 'created_at\.desc,id\.desc'/);
  assert.match(server, /next_offset: nextOffset/);
});

test('community category filters keep pagination and caches isolated', () => {
  const list = read('app/community.tsx');
  const api = read('src/api/community-core.ts');
  const cache = read('src/storage/communityFeedCache.ts');
  const cacheCore = read('src/storage/community-feed-cache-core.ts');

  assert.match(list, /community-filter-/);
  assert.match(list, /accessibilityRole="tab"/);
  assert.match(list, /accessibilityState=\{\{ selected \}\}/);
  assert.match(list, /listCommunityPosts\(0, PAGE_SIZE, category \|\| undefined\)/);
  assert.match(list, /listCommunityPosts\(nextOffset, PAGE_SIZE, category \|\| undefined\)/);
  assert.match(list, /readCachedCommunityFeed\(category\)/);
  assert.match(list, /cacheCommunityFeed\(page\.posts, page\.nextOffset, category\)/);
  assert.match(api, /category=\$\{encodeURIComponent\(category\)\}/);
  assert.match(cache, /communityFeedCacheKey\(category\)/);
  assert.match(cacheCore, /\.category\.\$\{encodeURIComponent\(scope\)\}/);
});

test('community comments sync retry-safe viewer likes through the existing API', () => {
  const detail = read('app/community/[id].tsx');
  const api = read('src/api/community-core.ts');
  const state = read('src/community/community-comment-like-state.ts');
  const server = read('../../netlify/functions/community-api.js');
  const migration = read('../../supabase/migrations/20260905031517_community_comment_likes.sql');

  assert.match(api, /action: 'toggle_comment_like'/);
  assert.match(server, /withViewerCommentLikeState/);
  assert.match(server, /community_post_comment_likes/);
  assert.match(server, /resolution=ignore-duplicates/);
  assert.match(detail, /community-comment-like-/);
  assert.match(detail, /optimisticCommunityCommentLike/);
  assert.match(detail, /resolveCommunityCommentLike/);
  assert.match(detail, /commentLikeError\.desiredLiked/);
  assert.match(state, /comment\.viewer_has_liked === liked/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.community_post_comment_likes from anon, authenticated/);
  assert.match(migration, /primary key \(comment_id, user_id\)/);
  assert.match(migration, /after insert on public\.community_post_comment_likes/);
  assert.match(migration, /after delete on public\.community_post_comment_likes/);
});

test('community comment reports preserve input and share the existing moderation queue', () => {
  const detail = read('app/community/[id].tsx');
  const api = read('src/api/community-core.ts');
  const server = read('../../netlify/functions/community-api.js');
  const adminServer = read('../../netlify/functions/community-admin.js');
  const adminUi = read('../../admin/community-center.js');
  const migration = read('../../supabase/migrations/20260905042010_community_comment_reports.sql');

  assert.match(detail, /community-comment-report-/);
  assert.match(detail, /community-comment-report-form-/);
  assert.match(detail, /commentReport\.reason/);
  assert.match(detail, /t\('community\.retryReport'\)/);
  assert.match(detail, /withUiTimeout\(reportCommunityComment/);
  assert.match(api, /action: 'report_comment'/);
  assert.match(server, /comment\.user_id === user\.id/);
  assert.match(server, /resolution=ignore-duplicates/);
  assert.match(adminServer, /select: 'id,post_id,comment_id,reporter_user_id/);
  assert.match(adminServer, /community_comment_report/);
  assert.match(adminServer, /community_moderation_actions/);
  assert.match(adminUi, /评论 \$\{esc\(r\.comment_id\)\}/);
  assert.match(migration, /num_nonnulls\(post_id, comment_id\) = 1/);
  assert.match(migration, /community_post_reports_comment_reporter_key/);
  assert.match(migration, /where comment_id is not null/);
  assert.match(migration, /grant select, insert, update, delete on public\.community_post_reports to service_role/);
});

test('community interactions create secure notifications with precise deep links', () => {
  const migration = read('../../supabase/migrations/20260905054500_community_interaction_notifications.sql');
  const notifications = read('src/community/notifications.ts');
  const routing = read('src/community/notification-core.ts');
  const detail = read('app/community/[id].tsx');
  const admin = read('../../netlify/functions/community-admin.js');

  assert.match(migration, /community_reply_notification/);
  assert.match(migration, /community_post_like_notification/);
  assert.match(migration, /community_comment_like_notification/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.notify_community_reply\(\) from public, anon, authenticated/);
  assert.match(notifications, /community_post_id,community_comment_id/);
  assert.match(routing, /\?commentId=/);
  assert.match(detail, /visibleThreadCountForComment/);
  assert.match(detail, /community-comment-target-status/);
  assert.match(detail, /styles\.targetComment/);
  assert.match(admin, /type: 'community_report'/);
  assert.match(admin, /row\.status !== value/);
});
