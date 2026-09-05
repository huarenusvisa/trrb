import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('wires persisted language selection through root, tabs and profile', () => {
  const root = read('app/_layout.tsx');
  const tabs = read('app/(tabs)/_layout.tsx');
  const profile = read('app/(tabs)/profile.tsx');
  const settings = read('app/language-settings.tsx');
  const provider = read('src/i18n/I18nProvider.tsx');

  assert.match(root, /<I18nProvider>/);
  for (const key of ['tab.home', 'tab.america', 'tab.immigration', 'tab.legal', 'tab.profile']) {
    assert.ok(tabs.includes(`t('${key}')`), `tab layout must translate ${key}`);
  }
  assert.match(profile, /testID="open-language-settings"/);
  assert.match(profile, /router\.push\('\/language-settings'\)/);
  for (const preference of ['system', 'zh-CN', 'zh-TW', 'en']) {
    assert.ok(settings.includes(`preference: '${preference}'`), `language screen must expose ${preference}`);
  }
  assert.match(provider, /AsyncStorage\.getItem\(STORAGE_KEY\)/);
  assert.match(provider, /AsyncStorage\.setItem\(STORAGE_KEY, safePreference\)/);
  assert.match(provider, /AppState\.addEventListener\('change'/);
});

test('uses the shared language context across news discovery surfaces', () => {
  const files = [
    'app/(tabs)/america.tsx',
    'app/(tabs)/legal.tsx',
    'app/category/[name].tsx',
    'app/search.tsx',
    'src/components/PaginatedNewsList.tsx',
  ];

  for (const path of files) {
    const source = read(path);
    assert.match(source, /useI18n\(\)/, `${path} must use the shared language context`);
  }

  const america = read('app/(tabs)/america.tsx');
  const legal = read('app/(tabs)/legal.tsx');
  const search = read('app/search.tsx');
  const list = read('src/components/PaginatedNewsList.tsx');
  assert.ok(america.includes("t('america.heading')"));
  assert.ok(legal.includes("t('legal.searchPlaceholder')"));
  assert.ok(search.includes("t('search.placeholder')"));
  assert.ok(list.includes("t('news.loading')"));
  assert.doesNotMatch(america, /toLocaleString\('zh-CN'\)/);
  assert.doesNotMatch(list, /toLocaleString\('zh-CN'\)/);
});

test('localizes unified account chrome and keeps Maestro language-neutral', () => {
  const auth = read('app/auth.tsx');
  const home = read('app/(tabs)/index.tsx');
  const searchFlow = read('.maestro/search.yml');
  const authFlow = read('.maestro/auth-login.yml');

  assert.match(auth, /useI18n\(\)/);
  for (const key of ['auth.heading', 'auth.description', 'auth.identifierPlaceholder', 'auth.passwordPlaceholder', 'auth.submit', 'auth.guest']) {
    assert.ok(auth.includes(`t('${key}')`), `auth screen must translate ${key}`);
  }
  assert.match(home, /testID="home-search-button"/);
  assert.match(searchFlow, /id: "home-search-button"/);
  assert.match(searchFlow, /id: "category-screen-title"/);
  assert.doesNotMatch(searchFlow, /visible: "搜索：特朗普"/);
  assert.match(authFlow, /Registration successful/);
  assert.match(authFlow, /Continue/);
});

test('localizes article chrome while preserving published story text', () => {
  const article = read('app/article/[id].tsx');
  assert.match(article, /useI18n\(\)/);
  for (const key of ['article.unavailableTitle', 'article.offline', 'article.continueReading', 'article.previous', 'article.next', 'article.save', 'article.share', 'article.copyLink', 'article.openWebsite', 'article.related', 'article.reviewedTranslation', 'article.showOriginal', 'article.showTranslation']) {
    assert.ok(article.includes(`t('${key}')`), `article detail must translate ${key}`);
  }
  assert.match(article, /article\.title/);
  assert.match(article, /displayedContent \|\| t\('article\.contentUnavailable'\)/);
  assert.match(article, /: article\.content/);
  assert.match(article, /testID="article-original-language-note"/);
  assert.match(article, /fetchArticleTranslation\(article\.id, locale\)/);
  assert.match(article, /testID="article-translation-toggle"/);
  assert.match(article, /testID="article-reviewed-translation-note"/);
  assert.doesNotMatch(article, /toLocaleString\('zh-CN'\)/);
});

test('localizes notification inbox and push settings without translating server content', () => {
  const inbox = read('app/notifications.tsx');
  const push = read('app/push-settings.tsx');

  for (const source of [inbox, push]) assert.match(source, /useI18n\(\)/);
  for (const key of ['inbox.heading', 'inbox.cacheNotice', 'inbox.emptyAllTitle', 'inbox.loadMore', 'inbox.pageErrorTitle']) {
    assert.ok(inbox.includes(`t('${key}')`), `notification inbox must translate ${key}`);
  }
  for (const key of ['push.heading', 'push.description', 'push.deviceTitle', 'push.openSystemSettings', 'push.types', 'push.footnote']) {
    assert.ok(push.includes(`t('${key}')`), `push settings must translate ${key}`);
  }
  assert.match(inbox, /item\.title \|\| t\(NOTICE_KEYS\[item\.type\]\)/);
  assert.match(inbox, /item\.body/);
  assert.match(inbox, /localeDateTag\(locale\)/);
  assert.doesNotMatch(inbox, /toLocaleString\('zh-CN'\)/);
  assert.match(push, /accessibilityLabel=\{t\(option\.title\)\}/);
});

test('localizes community list, post detail and comment actions while preserving user content', () => {
  const list = read('app/community.tsx');
  const detail = read('app/community/[id].tsx');

  for (const source of [list, detail]) {
    assert.match(source, /useI18n\(\)/);
    assert.match(source, /localeDateTag\(locale\)/);
    assert.doesNotMatch(source, /toLocaleString\('zh-CN'\)/);
  }
  for (const key of ['community.heading', 'community.cacheNotice', 'community.emptyAll', 'community.loadMore']) {
    assert.ok(list.includes(`t('${key}')`), `community list must translate ${key}`);
  }
  assert.ok(list.includes("'community.likeA11y'"));
  for (const key of ['community.detailLoadingTitle', 'community.reportPost', 'community.refreshFailedTitle', 'community.commentReviewing', 'community.signInToComment']) {
    assert.ok(detail.includes(`t('${key}')`), `community detail must translate ${key}`);
  }
  assert.match(list, /post\.title/);
  assert.match(list, /post\.content/);
  assert.match(detail, /<Text style=\{styles\.title\}>\{post\.title\}<\/Text>/);
  assert.match(detail, /<Text style=\{styles\.body\}>\{post\.content\}<\/Text>/);
  assert.match(detail, /<Text style=\{styles\.commentBody\}>\{item\.content\}<\/Text>/);
});

test('localizes community composer while preserving the entered draft', () => {
  const compose = read('app/community-compose.tsx');
  assert.match(compose, /useI18n\(\)/);
  for (const key of ['communityCompose.heading', 'communityCompose.privacyHint', 'communityCompose.draftRestored', 'communityCompose.titlePlaceholder', 'communityCompose.contentPlaceholder', 'communityCompose.failurePreserved', 'communityCompose.submit']) {
    assert.ok(compose.includes(`t('${key}')`), `community composer must translate ${key}`);
  }
  assert.match(compose, /title: title\.trim\(\)/);
  assert.match(compose, /content: content\.trim\(\)/);
  assert.match(compose, /t\(item\.label\)/);
  assert.doesNotMatch(compose, /<Text style=\{styles\.title\}>分享经历或提出问题<\/Text>/);
});

test('localizes profile composer while preserving captions and selected media', () => {
  const compose = read('app/profile-compose.tsx');
  assert.match(compose, /useI18n\(\)/);
  for (const key of ['profileCompose.heading', 'profileCompose.mediaLimits', 'profileCompose.draftRestored', 'profileCompose.captionPlaceholder', 'profileCompose.privacyNotice', 'profileCompose.failurePreserved', 'profileCompose.submit']) {
    assert.ok(compose.includes(`t('${key}')`), `profile composer must translate ${key}`);
  }
  assert.match(compose, /createProfilePost\(caption, assets/);
  assert.match(compose, /source=\{\{ uri: asset\.uri \}\}/);
  assert.doesNotMatch(compose, /<Text style=\{styles\.title\}>分享图片或视频<\/Text>/);
});

test('localizes user profile actions while preserving names, bios and posts', () => {
  const profile = read('app/user/[id].tsx');
  const hero = read('src/components/ProfileHero.tsx');
  const posts = read('src/components/ProfilePostList.tsx');
  for (const source of [profile, hero, posts]) assert.match(source, /useI18n\(\)/);
  for (const key of ['userProfile.loadingTitle', 'userProfile.followTimeout', 'userProfile.unblockFailed', 'userProfile.blockConfirmTitle', 'userProfile.privateTitle']) {
    assert.ok(profile.includes(`t('${key}'`), `user profile must translate ${key}`);
  }
  assert.match(profile, /t\('userProfile\.postCount', \{ count: posts\.length \}\)/);
  for (const key of ['userProfile.avatarA11y', 'userProfile.privateAccount', 'userProfile.bioFallback', 'userProfile.followersLabel']) {
    assert.ok(hero.includes(`t('${key}'`), `profile hero must translate ${key}`);
  }
  assert.match(profile, /title: profile\.display_name \|\| t\('userProfile\.screenTitle'\)/);
  assert.match(hero, /profile\.display_name \|\| t\('userProfile\.readerFallback'\)/);
  assert.match(hero, /profile\.bio\?\.trim\(\) \|\| t\('userProfile\.bioFallback'\)/);
  assert.match(profile, /<ProfilePostList posts=\{posts\} \/>/);
  assert.match(posts, /post\.caption/);
  assert.match(posts, /localeDateTag\(locale\)/);
  assert.ok(posts.includes("t('userProfile.noPublicPostsBody')"));
  assert.ok(posts.includes("t('userProfile.deletePostTitle')"));
  assert.doesNotMatch(posts, /toLocaleString\('zh-CN'\)/);
});

test('localizes follower and following lists while preserving profile content', () => {
  const connections = read('app/connections/[type].tsx');
  assert.match(connections, /useI18n\(\)/);
  for (const key of ['connections.loadingFollowers', 'connections.followersTimeout', 'connections.noFollowersBody', 'connections.openProfileA11y']) {
    assert.ok(connections.includes(`'${key}'`), `connection list must translate ${key}`);
  }
  assert.match(connections, /profile\.display_name/);
  assert.match(connections, /profile\.bio/);
  assert.doesNotMatch(connections, />粉丝</);
  assert.doesNotMatch(connections, />关注<\/Text>/);
});

test('localizes protected messaging while preserving names and message bodies', () => {
  const inbox = read('app/messages.tsx');
  const chat = read('app/chat/[id].tsx');
  for (const source of [inbox, chat]) assert.match(source, /useI18n\(\)/);
  for (const key of ['messages.protectionTitle', 'messages.pendingIncoming', 'messages.openChatStateA11y', 'messages.emptyBody']) {
    assert.ok(inbox.includes(`'${key}'`), `message inbox must translate ${key}`);
  }
  for (const key of ['chat.incomingBody', 'chat.waiting', 'chat.requestPlaceholder', 'chat.sendFailed']) {
    assert.ok(chat.includes(`'${key}'`), `chat must translate ${key}`);
  }
  assert.match(inbox, /item\.partner\?\.display_name/);
  assert.match(inbox, /item\.latest_message\?\.body/);
  assert.match(chat, /message\.body/);
  assert.match(chat, /localeDateTag\(locale\)/);
  assert.doesNotMatch(chat, /toLocaleTimeString\('zh-CN'/);
});
