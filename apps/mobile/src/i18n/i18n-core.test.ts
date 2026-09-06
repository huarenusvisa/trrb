import assert from 'node:assert/strict';
import test from 'node:test';
import { authClientErrorMessage, authValidationMessage, languageName, localeDateTag, newsCategoryName, normalizeLocale, normalizeLocalePreference, resolveLocale, translate } from './i18n-core.ts';

test('maps supported system locale variants without confusing Traditional and Simplified Chinese', () => {
  assert.equal(normalizeLocale('zh-Hant-HK'), 'zh-TW');
  assert.equal(normalizeLocale('zh_TW'), 'zh-TW');
  assert.equal(normalizeLocale('zh-Hans-SG'), 'zh-CN');
  assert.equal(normalizeLocale('zh-CN'), 'zh-CN');
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('es-US'), 'zh-CN');
});

test('keeps valid persisted choices and safely resets invalid storage values', () => {
  assert.equal(normalizeLocalePreference('system'), 'system');
  assert.equal(normalizeLocalePreference('zh-TW'), 'zh-TW');
  assert.equal(normalizeLocalePreference('es'), 'system');
  assert.equal(resolveLocale('system', 'en-GB'), 'en');
  assert.equal(resolveLocale('zh-CN', 'en-US'), 'zh-CN');
});

test('translates navigation and interpolates dynamic profile values', () => {
  assert.equal(translate('zh-TW', 'tab.home'), '首頁');
  assert.equal(translate('en', 'tab.legal'), 'Legal');
  assert.equal(translate('en', 'profile.unread', { count: 3 }), ' · 3 unread');
  assert.equal(translate('zh-CN', 'profile.loggedIn', { account: 'reader@example.com' }), '已登录 · reader@example.com');
});

test('returns endonyms for the active interface language', () => {
  assert.equal(languageName('zh-CN'), '简体中文');
  assert.equal(languageName('zh-TW'), '繁體中文');
  assert.equal(languageName('en'), 'English');
});

test('localizes news browsing chrome while preserving unknown source categories', () => {
  assert.equal(translate('zh-TW', 'search.history'), '搜尋紀錄');
  assert.equal(translate('en', 'legal.count', { count: 42 }), '42 records');
  assert.equal(newsCategoryName('en', '美国时政'), 'U.S. Politics');
  assert.equal(newsCategoryName('zh-TW', '热门头条'), '中國熱門頭條');
  assert.equal(newsCategoryName('en', '地方新闻'), '地方新闻');
  assert.equal(newsCategoryName('en', ''), 'News');
  assert.equal(localeDateTag('en'), 'en-US');
  assert.equal(localeDateTag('zh-TW'), 'zh-TW');
  assert.equal(translate('en', 'article.previousA11y', { title: 'Sample' }), 'Previous story: Sample');
  assert.equal(translate('zh-TW', 'article.saved'), '已收藏');
});

test('translates homepage topics and legal detail chrome', () => {
  assert.equal(translate('en', 'home.topicIceTitle'), 'ICE enforcement updates');
  assert.equal(translate('zh-TW', 'home.openTopicA11y', { title: 'ICE 執法動態' }), '開啟專題：ICE 執法動態');
  assert.equal(translate('en', 'legal.detailDocket', { value: '23-101' }), 'Docket: 23-101');
  assert.equal(translate('zh-CN', 'legal.detailOpenOfficial'), '查看官方原文');
});

test('translates homepage service portals, reader services and footer', () => {
  assert.equal(translate('en', 'home.portalJudgesTitle'), 'Immigration judge grant rates');
  assert.equal(translate('zh-TW', 'home.portalImmigrationCitizenship'), '入籍美國公民');
  assert.equal(translate('en', 'home.openPortalItemA11y', { item: 'Supreme Court' }), 'Open service item: Supreme Court');
  assert.equal(translate('zh-CN', 'home.readerTipsAction'), '提交线索');
  assert.equal(translate('en', 'home.footerBrand'), 'Tang Ren Daily');
});

test('translates homepage navigation, rankings, weather and network states', () => {
  assert.equal(translate('en', 'home.navUsPolitics'), 'U.S. Politics');
  assert.equal(translate('zh-TW', 'home.ranking24h'), '24 小時熱榜');
  assert.equal(translate('en', 'home.weatherPartlyCloudy'), 'Partly cloudy');
  assert.equal(translate('zh-CN', 'home.offline'), '网络不可用，正在显示上次读取的新闻。下拉即可重试。');
  assert.equal(translate('en', 'home.sectionIce'), 'ICE enforcement updates');
});

test('localizes account validation and known client failures without hiding server details', () => {
  assert.equal(authValidationMessage('en', 'identifier'), 'Enter a valid email address or phone number.');
  assert.equal(authValidationMessage('zh-TW', 'password'), '密碼需要 8–128 位。');
  assert.equal(authClientErrorMessage('en', new Error('连接账号服务超时，请检查网络后重试。')), 'The account service timed out. Check your connection and try again.');
  assert.equal(authClientErrorMessage('en', new Error('登录失败（503）')), 'Sign-in failed (503)');
  assert.equal(authClientErrorMessage('en', new Error('账号或密码错误')), '账号或密码错误');
});

test('translates notification categories, fallback labels and push preferences', () => {
  assert.equal(translate('en', 'inbox.category.moderation'), 'Moderation & system');
  assert.equal(translate('zh-TW', 'inbox.notice.messageRequest'), '你收到一則聊天申請');
  assert.equal(translate('en', 'inbox.emptyCategoryTitle', { category: 'Likes' }), 'No Likes notifications');
  assert.equal(translate('zh-TW', 'push.deviceTitle'), '允許本裝置接收通知');
  assert.equal(translate('en', 'push.commentsMeta'), 'New replies to news and community comments');
});

test('translates community categories and comment actions without changing user text', () => {
  assert.equal(translate('en', 'community.screenTitle'), 'Immigration Community');
  assert.equal(translate('zh-TW', 'community.category.courtExperience'), '出庭交流');
  assert.equal(translate('en', 'community.emptyCategory', { category: 'ICE experiences' }), 'No public posts in ICE experiences');
  assert.equal(translate('en', 'community.draftRestoredReply', { name: 'Alex' }), 'Comment draft restored; replying to Alex.');
  assert.equal(translate('zh-CN', 'community.commentCount', { count: 3 }), '评论 3');
});

test('translates community composer privacy, draft and submission states', () => {
  assert.equal(translate('en', 'communityCompose.categoryA11y', { category: 'Immigration help' }), 'Choose the Immigration help category');
  assert.equal(translate('zh-TW', 'communityCompose.draftRestored'), '已恢復社區貼文草稿');
  assert.equal(translate('en', 'communityCompose.failurePreserved'), 'The title, text and category are still on this page.');
  assert.equal(translate('zh-CN', 'communityCompose.draftCounter', { count: 21 }), '21/12000 · 草稿自动保存 7 天');
});

test('translates profile composer media, progress and recovery states', () => {
  assert.equal(translate('en', 'profileCompose.uploading', { current: 2, total: 4 }), 'Uploading file 2/4…');
  assert.equal(translate('zh-TW', 'profileCompose.draftRestored'), '已恢復文字草稿');
  assert.equal(translate('en', 'profileCompose.videoDuration', { seconds: 75 }), 'Video · 75 seconds');
  assert.equal(translate('zh-CN', 'profileCompose.failurePreserved'), '已选媒体和文字仍保留在本页。');
});

test('translates user profile relationships, privacy and recovery states', () => {
  assert.equal(translate('en', 'userProfile.requestSent'), 'Follow request sent.');
  assert.equal(translate('zh-TW', 'userProfile.unblockFailed'), '解除封鎖失敗');
  assert.equal(translate('en', 'userProfile.followersCountA11y', { count: 12 }), '12 followers');
  assert.equal(translate('zh-CN', 'userProfile.postCount', { count: 3 }), '3 条');
  assert.equal(translate('en', 'userProfile.noPublicPostsBody'), 'There is no public content here yet.');
});

test('translates follower and following lists while interpolating profile names', () => {
  assert.equal(translate('en', 'connections.followers'), 'Followers');
  assert.equal(translate('zh-TW', 'connections.noFollowing'), '尚未追蹤任何人');
  assert.equal(translate('en', 'connections.openProfileA11y', { name: 'Alex' }), "Open Alex's profile");
});

test('translates protected message requests and chat states', () => {
  assert.equal(translate('en', 'messages.protectionTitle'), 'Message request protection is on');
  assert.equal(translate('zh-TW', 'messages.pendingIncoming'), '待你確認');
  assert.equal(translate('en', 'messages.openChatStateA11y', { name: 'Alex', state: 'Declined' }), 'Open chat with Alex, Declined');
  assert.equal(translate('zh-CN', 'chat.waiting'), '已发送第一条消息，等待对方确认聊天。确认前不能再发送。');
  assert.equal(translate('en', 'chat.accept'), 'Accept chat');
});

test('translates follow requests and profile settings while interpolating names', () => {
  assert.equal(translate('en', 'followRequests.acceptA11y', { name: 'Alex' }), "Accept Alex's follow request");
  assert.equal(translate('zh-TW', 'followRequests.emptyTitle'), '暫無待處理申請');
  assert.equal(translate('en', 'profileSettings.privateAccount'), 'Private account');
  assert.equal(translate('zh-CN', 'profileSettings.savedBody'), '头像、背景和隐私设置已同步。');
});

test('translates comments, saved stories and reading history without changing titles', () => {
  assert.equal(translate('en', 'myComments.openArticleA11y', { status: 'In review' }), 'Open the story for this comment, status: In review');
  assert.equal(translate('zh-TW', 'favorites.synced'), '已與帳戶雲端收藏合併');
  assert.equal(translate('en', 'history.clearTitle'), 'Clear reading history?');
  assert.equal(translate('zh-CN', 'history.openArticleA11y', { title: '原始标题' }), '打开历史新闻：原始标题');
});

test('translates news comment composition, moderation and pagination states', () => {
  assert.equal(translate('en', 'comments.hint'), 'Sign in to comment, reply, like, and report. Only published comments appear publicly.');
  assert.equal(translate('zh-TW', 'comments.reportSubmitted'), '檢舉已提交，我們會在後台審核。');
  assert.equal(translate('en', 'comments.reportingUser', { name: 'Alex' }), "Report Alex's comment");
  assert.equal(translate('zh-CN', 'comments.draftCounter', { count: 12 }), '12/3000 · 草稿自动保存 7 天');
  assert.equal(translate('en', 'comments.likeA11y', { count: 3 }), 'Like, 3 likes');
});

test('translates profile data controls and the permanent account deletion flow', () => {
  assert.equal(translate('en', 'profile.pendingCount', { count: 2 }), ' · 2 pending');
  assert.equal(translate('zh-TW', 'profile.accountPrivacy'), '帳戶與隱私');
  assert.equal(translate('en', 'deleteAccount.confirmLabel'), 'Type DELETE to confirm');
  assert.equal(translate('zh-CN', 'deleteAccount.deletedBody'), '账户与关联个人数据已永久删除。');
});
