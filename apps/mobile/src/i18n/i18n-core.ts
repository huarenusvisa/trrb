export const SUPPORTED_LOCALES = ['zh-CN', 'zh-TW', 'en'] as const;
export const LOCALE_PREFERENCES = ['system', ...SUPPORTED_LOCALES] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type LocalePreference = (typeof LOCALE_PREFERENCES)[number];

const zhCN = {
  'tab.home': '首页',
  'tab.homeIcon': '首',
  'tab.america': '美国',
  'tab.americaIcon': '美',
  'tab.immigration': '移民',
  'tab.immigrationIcon': '移',
  'tab.legal': '判例新规',
  'tab.legalIcon': '法',
  'tab.profile': '我的',
  'tab.profileIcon': '我',
  'common.back': '返回',
  'news.loading': '正在读取最新内容…',
  'news.loadFailed': '新闻加载失败',
  'news.empty': '暂时没有符合条件的新闻。',
  'news.end': '已经到底了',
  'news.openArticle': '打开新闻：{title}',
  'news.categoryPage': '新闻栏目',
  'news.categoryFallback': '新闻',
  'news.categoryHot': '中国热门头条',
  'news.categoryUsPolitics': '美国时政',
  'news.categoryUsPublicSafety': '美国警情',
  'news.categoryImmigration': '移民美国',
  'news.categoryIce': 'ICE执法动态',
  'america.heading': '美国',
  'america.subtitle': '美国时政 · 美国警情',
  'america.loadFailed': '美国频道加载失败',
  'america.empty': '暂无最新内容',
  'legal.heading': '美国判例与新规',
  'legal.subtitle': '官方法律资料数据库 · App 原生详情',
  'legal.databaseError': '法律数据库 {status}',
  'legal.loadFailed': '法律数据库加载失败',
  'legal.searchPlaceholder': '搜索案名、案号、引证或机构',
  'legal.count': '共 {count} 条',
  'legal.officialSource': '官方法律资料',
  'legal.untitled': '未命名法律资料',
  'search.placeholder': '搜索新闻标题或摘要',
  'search.submit': '搜索',
  'search.filter': '栏目：{category} ×',
  'search.backHome': '返回搜索首页',
  'search.queryTitle': '搜索：{query}',
  'search.categoryTitle': '栏目：{category}',
  'search.empty': '没有找到相关已发布新闻。',
  'search.trending': '热搜',
  'search.trendingSource': '来自正式已发布新闻数据',
  'search.noTrending': '暂时没有可用热搜数据。',
  'search.history': '搜索历史',
  'search.clear': '清除',
  'search.noHistory': '暂无搜索历史。',
  'auth.screenTitle': '登录 / 注册',
  'auth.heading': '唐人日报账户',
  'auth.description': '输入邮箱或手机号和密码。账号不存在时会自动创建并直接登录，不需要额外验证。',
  'auth.notConfiguredTitle': '登录暂未配置',
  'auth.notConfiguredBody': '当前版本尚未连接生产身份服务。',
  'auth.registerSuccess': '注册成功',
  'auth.signInSuccess': '登录成功',
  'auth.registerSuccessBody': '账户已创建并登录，无需额外验证。',
  'auth.welcomeBack': '欢迎回来。',
  'auth.continue': '继续',
  'auth.identifierPlaceholder': '邮箱或手机号',
  'auth.passwordPlaceholder': '密码（8–128位）',
  'auth.busy': '正在登录…',
  'auth.submit': '登录 / 注册',
  'auth.guest': '继续以游客身份阅读',
  'auth.retry': '请稍后重试',
  'auth.validationRequired': '请输入邮箱或手机号和密码。',
  'auth.validationIdentifier': '请输入有效的邮箱或手机号。',
  'auth.validationPassword': '密码需要 8–128 位。',
  'auth.serviceInvalid': '账号服务返回异常，请稍后重试。',
  'auth.sessionInvalid': '登录状态无效，请重新登录。',
  'auth.timeout': '连接账号服务超时，请检查网络后重试。',
  'auth.network': '无法连接账号服务，请检查网络后重试。',
  'auth.httpFailed': '登录失败（{status}）',
  'profile.heading': '我的',
  'profile.loggedIn': '已登录 · {account}',
  'profile.guest': '游客模式 · 无需注册即可阅读全部公开内容',
  'profile.authWarning': '当前构建尚未配置生产身份服务环境变量。',
  'profile.login': '登录 / 创建账户',
  'profile.community': '移民社区',
  'profile.communityMemberMeta': '浏览帖子、分享经历和发布问题',
  'profile.communityGuestMeta': '浏览无需登录；发帖时再登录或注册',
  'profile.notifications': '消息中心',
  'profile.unread': ' · {count}条未读',
  'profile.notificationsMeta': '回复、点赞、关注与系统通知',
  'profile.comments': '我的评论',
  'profile.commentsMeta': '查看评论状态并返回对应新闻',
  'profile.favorites': '收藏',
  'profile.favoritesMeta': '本机与账号云端收藏自动安全合并',
  'profile.localFavorites': '本机收藏',
  'profile.localFavoritesMeta': '登录前继续保存在当前设备',
  'profile.history': '阅读历史',
  'profile.historyMeta': '本机与账号云端历史自动合并，最多100条',
  'profile.localHistory': '本机阅读历史',
  'profile.localHistoryMeta': '登录前继续保存在当前设备',
  'profile.accountSettings': '账号设置',
  'profile.accountSettingsMeta': '修改昵称、默认头像与公开简介',
  'profile.signOut': '退出登录',
  'profile.signOutFailed': '退出失败',
  'profile.pushDisableFailed': '无法停用本设备通知',
  'profile.pushDisableFailedMeta': '网络异常时退出后仍可能收到通知。可以先在系统设置关闭通知，或仍然退出。',
  'profile.cancel': '取消',
  'profile.signOutAnyway': '仍然退出',
  'profile.fontSize': '阅读字号',
  'profile.fontSizeMeta': '统一设置新闻正文大小，之后所有新闻详情页自动使用此字号',
  'profile.fontSmall': '小',
  'profile.fontStandard': '标准',
  'profile.fontLarge': '大',
  'profile.fontExtraLarge': '特大',
  'profile.pushSettings': '推送设置',
  'profile.pushSettingsMeta': '重大新闻 · ICE · 移民 · 判例新规 · 社区互动',
  'profile.pushSettingsGuestMeta': '登录后选择通知类型',
  'profile.language': '语言',
  'profile.languageMeta': '当前：{language}',
  'profile.openWebsite': '打开 trrb.net',
  'profile.openWebsiteMeta': '访问唐人日报网站',
  'language.heading': '语言设置',
  'language.description': '界面语言会保存在本设备。选择“跟随系统”时，App 会自动使用支持的系统语言。',
  'language.system': '跟随系统',
  'language.systemMeta': '自动识别简体中文、繁体中文或英文',
  'language.zhCN': '简体中文',
  'language.zhCNMeta': 'Simplified Chinese',
  'language.zhTW': '繁體中文',
  'language.zhTWMeta': 'Traditional Chinese',
  'language.en': 'English',
  'language.enMeta': '英文',
  'language.selected': '已选择',
} as const;

export type MessageKey = keyof typeof zhCN;

const zhTW: Record<MessageKey, string> = {
  'tab.home': '首頁', 'tab.homeIcon': '首', 'tab.america': '美國', 'tab.americaIcon': '美', 'tab.immigration': '移民', 'tab.immigrationIcon': '移', 'tab.legal': '判例新規', 'tab.legalIcon': '法', 'tab.profile': '我的', 'tab.profileIcon': '我',
  'common.back': '返回',
  'news.loading': '正在讀取最新內容…', 'news.loadFailed': '新聞載入失敗', 'news.empty': '目前沒有符合條件的新聞。', 'news.end': '已經到底了', 'news.openArticle': '開啟新聞：{title}', 'news.categoryPage': '新聞欄目', 'news.categoryFallback': '新聞', 'news.categoryHot': '中國熱門頭條', 'news.categoryUsPolitics': '美國時政', 'news.categoryUsPublicSafety': '美國警情', 'news.categoryImmigration': '移民美國', 'news.categoryIce': 'ICE 執法動態',
  'america.heading': '美國', 'america.subtitle': '美國時政 · 美國警情', 'america.loadFailed': '美國頻道載入失敗', 'america.empty': '暫無最新內容',
  'legal.heading': '美國判例與新規', 'legal.subtitle': '官方法律資料庫 · App 原生詳情', 'legal.databaseError': '法律資料庫 {status}', 'legal.loadFailed': '法律資料庫載入失敗', 'legal.searchPlaceholder': '搜尋案名、案號、引證或機構', 'legal.count': '共 {count} 筆', 'legal.officialSource': '官方法律資料', 'legal.untitled': '未命名法律資料',
  'search.placeholder': '搜尋新聞標題或摘要', 'search.submit': '搜尋', 'search.filter': '欄目：{category} ×', 'search.backHome': '返回搜尋首頁', 'search.queryTitle': '搜尋：{query}', 'search.categoryTitle': '欄目：{category}', 'search.empty': '沒有找到相關已發布新聞。', 'search.trending': '熱搜', 'search.trendingSource': '來自正式已發布新聞資料', 'search.noTrending': '目前沒有可用熱搜資料。', 'search.history': '搜尋紀錄', 'search.clear': '清除', 'search.noHistory': '暫無搜尋紀錄。',
  'auth.screenTitle': '登入 / 註冊', 'auth.heading': '唐人日報帳戶', 'auth.description': '輸入電子郵件或手機號碼和密碼。帳戶不存在時會自動建立並直接登入，不需要額外驗證。', 'auth.notConfiguredTitle': '登入尚未設定', 'auth.notConfiguredBody': '目前版本尚未連接正式身分服務。', 'auth.registerSuccess': '註冊成功', 'auth.signInSuccess': '登入成功', 'auth.registerSuccessBody': '帳戶已建立並登入，無需額外驗證。', 'auth.welcomeBack': '歡迎回來。', 'auth.continue': '繼續', 'auth.identifierPlaceholder': '電子郵件或手機號碼', 'auth.passwordPlaceholder': '密碼（8–128位）', 'auth.busy': '正在登入…', 'auth.submit': '登入 / 註冊', 'auth.guest': '繼續以訪客身分閱讀', 'auth.retry': '請稍後再試', 'auth.validationRequired': '請輸入電子郵件或手機號碼和密碼。', 'auth.validationIdentifier': '請輸入有效的電子郵件或手機號碼。', 'auth.validationPassword': '密碼需要 8–128 位。', 'auth.serviceInvalid': '帳戶服務回應異常，請稍後再試。', 'auth.sessionInvalid': '登入狀態無效，請重新登入。', 'auth.timeout': '連接帳戶服務逾時，請檢查網路後重試。', 'auth.network': '無法連接帳戶服務，請檢查網路後重試。', 'auth.httpFailed': '登入失敗（{status}）',
  'profile.heading': '我的', 'profile.loggedIn': '已登入 · {account}', 'profile.guest': '訪客模式 · 無需註冊即可閱讀全部公開內容', 'profile.authWarning': '目前版本尚未設定正式身分服務環境變數。', 'profile.login': '登入 / 建立帳戶',
  'profile.community': '移民社區', 'profile.communityMemberMeta': '瀏覽貼文、分享經歷和提出問題', 'profile.communityGuestMeta': '瀏覽無需登入；發文時再登入或註冊', 'profile.notifications': '訊息中心', 'profile.unread': ' · {count}則未讀', 'profile.notificationsMeta': '回覆、按讚、追蹤與系統通知',
  'profile.comments': '我的評論', 'profile.commentsMeta': '查看評論狀態並返回對應新聞', 'profile.favorites': '收藏', 'profile.favoritesMeta': '本機與帳戶雲端收藏自動安全合併', 'profile.localFavorites': '本機收藏', 'profile.localFavoritesMeta': '登入前繼續保存在目前裝置',
  'profile.history': '閱讀紀錄', 'profile.historyMeta': '本機與帳戶雲端紀錄自動合併，最多100則', 'profile.localHistory': '本機閱讀紀錄', 'profile.localHistoryMeta': '登入前繼續保存在目前裝置', 'profile.accountSettings': '帳戶設定', 'profile.accountSettingsMeta': '修改暱稱、預設頭像與公開簡介',
  'profile.signOut': '登出', 'profile.signOutFailed': '登出失敗', 'profile.pushDisableFailed': '無法停用本裝置通知', 'profile.pushDisableFailedMeta': '網路異常時登出後仍可能收到通知。可以先在系統設定關閉通知，或仍然登出。', 'profile.cancel': '取消', 'profile.signOutAnyway': '仍然登出',
  'profile.fontSize': '閱讀字級', 'profile.fontSizeMeta': '統一設定新聞內文字級，之後所有新聞詳情頁會自動使用此字級', 'profile.fontSmall': '小', 'profile.fontStandard': '標準', 'profile.fontLarge': '大', 'profile.fontExtraLarge': '特大',
  'profile.pushSettings': '推播設定', 'profile.pushSettingsMeta': '重大新聞 · ICE · 移民 · 判例新規 · 社區互動', 'profile.pushSettingsGuestMeta': '登入後選擇通知類型', 'profile.language': '語言', 'profile.languageMeta': '目前：{language}', 'profile.openWebsite': '開啟 trrb.net', 'profile.openWebsiteMeta': '造訪唐人日報網站',
  'language.heading': '語言設定', 'language.description': '介面語言會保存在本裝置。選擇「跟隨系統」時，App 會自動使用支援的系統語言。', 'language.system': '跟隨系統', 'language.systemMeta': '自動識別簡體中文、繁體中文或英文', 'language.zhCN': '简体中文', 'language.zhCNMeta': 'Simplified Chinese', 'language.zhTW': '繁體中文', 'language.zhTWMeta': 'Traditional Chinese', 'language.en': 'English', 'language.enMeta': '英文', 'language.selected': '已選擇',
};

const en: Record<MessageKey, string> = {
  'tab.home': 'Home', 'tab.homeIcon': 'H', 'tab.america': 'U.S.', 'tab.americaIcon': 'U', 'tab.immigration': 'Immigration', 'tab.immigrationIcon': 'I', 'tab.legal': 'Legal', 'tab.legalIcon': 'L', 'tab.profile': 'Me', 'tab.profileIcon': 'M',
  'common.back': 'Back',
  'news.loading': 'Loading the latest stories…', 'news.loadFailed': 'Could not load stories', 'news.empty': 'No matching published stories yet.', 'news.end': 'You have reached the end', 'news.openArticle': 'Open story: {title}', 'news.categoryPage': 'News category', 'news.categoryFallback': 'News', 'news.categoryHot': 'China Top Stories', 'news.categoryUsPolitics': 'U.S. Politics', 'news.categoryUsPublicSafety': 'U.S. Public Safety', 'news.categoryImmigration': 'U.S. Immigration', 'news.categoryIce': 'ICE Enforcement',
  'america.heading': 'United States', 'america.subtitle': 'U.S. politics · Public safety', 'america.loadFailed': 'Could not load the U.S. channel', 'america.empty': 'No new stories yet',
  'legal.heading': 'U.S. Cases & Rules', 'legal.subtitle': 'Official legal sources · Native app details', 'legal.databaseError': 'Legal database {status}', 'legal.loadFailed': 'Could not load the legal database', 'legal.searchPlaceholder': 'Search title, docket, citation or agency', 'legal.count': '{count} records', 'legal.officialSource': 'Official legal source', 'legal.untitled': 'Untitled legal record',
  'search.placeholder': 'Search story titles or summaries', 'search.submit': 'Search', 'search.filter': 'Category: {category} ×', 'search.backHome': 'Back to search', 'search.queryTitle': 'Search: {query}', 'search.categoryTitle': 'Category: {category}', 'search.empty': 'No matching published stories found.', 'search.trending': 'Trending', 'search.trendingSource': 'From published news data', 'search.noTrending': 'Trending data is not available yet.', 'search.history': 'Search history', 'search.clear': 'Clear', 'search.noHistory': 'No search history yet.',
  'auth.screenTitle': 'Sign in / Register', 'auth.heading': 'Tangren Daily account', 'auth.description': 'Enter your email address or phone number and password. If the account does not exist, it will be created and signed in immediately without another verification step.', 'auth.notConfiguredTitle': 'Sign-in is not configured', 'auth.notConfiguredBody': 'This build is not connected to the production identity service.', 'auth.registerSuccess': 'Registration successful', 'auth.signInSuccess': 'Sign-in successful', 'auth.registerSuccessBody': 'Your account was created and signed in. No additional verification is required.', 'auth.welcomeBack': 'Welcome back.', 'auth.continue': 'Continue', 'auth.identifierPlaceholder': 'Email address or phone number', 'auth.passwordPlaceholder': 'Password (8–128 characters)', 'auth.busy': 'Signing in…', 'auth.submit': 'Sign in / Register', 'auth.guest': 'Continue reading as a guest', 'auth.retry': 'Please try again later', 'auth.validationRequired': 'Enter your email address or phone number and password.', 'auth.validationIdentifier': 'Enter a valid email address or phone number.', 'auth.validationPassword': 'Password must be 8–128 characters.', 'auth.serviceInvalid': 'The account service returned an invalid response. Try again later.', 'auth.sessionInvalid': 'Your sign-in session is invalid. Sign in again.', 'auth.timeout': 'The account service timed out. Check your connection and try again.', 'auth.network': 'Could not reach the account service. Check your connection and try again.', 'auth.httpFailed': 'Sign-in failed ({status})',
  'profile.heading': 'Me', 'profile.loggedIn': 'Signed in · {account}', 'profile.guest': 'Guest mode · Read all public stories without an account', 'profile.authWarning': 'Production identity service is not configured in this build.', 'profile.login': 'Sign in / Create account',
  'profile.community': 'Immigration Community', 'profile.communityMemberMeta': 'Browse posts, share experiences and ask questions', 'profile.communityGuestMeta': 'Browse without signing in; sign in when you post', 'profile.notifications': 'Notifications', 'profile.unread': ' · {count} unread', 'profile.notificationsMeta': 'Replies, likes, follows and system notices',
  'profile.comments': 'My comments', 'profile.commentsMeta': 'Review comment status and return to the story', 'profile.favorites': 'Saved stories', 'profile.favoritesMeta': 'Safely merge on-device and cloud favorites', 'profile.localFavorites': 'On-device favorites', 'profile.localFavoritesMeta': 'Kept on this device until you sign in',
  'profile.history': 'Reading history', 'profile.historyMeta': 'Merge device and cloud history, up to 100 stories', 'profile.localHistory': 'On-device history', 'profile.localHistoryMeta': 'Kept on this device until you sign in', 'profile.accountSettings': 'Account settings', 'profile.accountSettingsMeta': 'Edit display name, avatar and public bio',
  'profile.signOut': 'Sign out', 'profile.signOutFailed': 'Could not sign out', 'profile.pushDisableFailed': 'Could not disable notifications', 'profile.pushDisableFailedMeta': 'You may still receive notifications after signing out while offline. Disable them in system settings first, or continue signing out.', 'profile.cancel': 'Cancel', 'profile.signOutAnyway': 'Sign out anyway',
  'profile.fontSize': 'Article text size', 'profile.fontSizeMeta': 'Use this text size on every news article', 'profile.fontSmall': 'Small', 'profile.fontStandard': 'Standard', 'profile.fontLarge': 'Large', 'profile.fontExtraLarge': 'Extra large',
  'profile.pushSettings': 'Push notifications', 'profile.pushSettingsMeta': 'Breaking news · ICE · Immigration · Legal · Community', 'profile.pushSettingsGuestMeta': 'Sign in to choose notification types', 'profile.language': 'Language', 'profile.languageMeta': 'Current: {language}', 'profile.openWebsite': 'Open trrb.net', 'profile.openWebsiteMeta': 'Visit the Tangren Daily website',
  'language.heading': 'Language', 'language.description': 'Your interface language is saved on this device. Follow system automatically selects a supported system language.', 'language.system': 'Follow system', 'language.systemMeta': 'Automatically use Simplified Chinese, Traditional Chinese or English', 'language.zhCN': '简体中文', 'language.zhCNMeta': 'Simplified Chinese', 'language.zhTW': '繁體中文', 'language.zhTWMeta': 'Traditional Chinese', 'language.en': 'English', 'language.enMeta': 'English', 'language.selected': 'Selected',
};

const MESSAGES: Record<SupportedLocale, Record<MessageKey, string>> = { 'zh-CN': zhCN, 'zh-TW': zhTW, en };

export function normalizeLocale(value: unknown): SupportedLocale {
  const locale = String(value || '').trim().replace(/_/g, '-').toLowerCase();
  if (locale.startsWith('en')) return 'en';
  if (locale.startsWith('zh')) {
    if (locale.includes('hant') || /^zh-(tw|hk|mo)(-|$)/.test(locale)) return 'zh-TW';
    return 'zh-CN';
  }
  return 'zh-CN';
}

export function normalizeLocalePreference(value: unknown): LocalePreference {
  return LOCALE_PREFERENCES.includes(value as LocalePreference) ? value as LocalePreference : 'system';
}

export function resolveLocale(preference: LocalePreference, systemLocale: unknown): SupportedLocale {
  return preference === 'system' ? normalizeLocale(systemLocale) : preference;
}

export function translate(locale: SupportedLocale, key: MessageKey, params: Record<string, string | number> = {}): string {
  return MESSAGES[locale][key].replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(params, name) ? String(params[name]) : match);
}

export function languageName(locale: SupportedLocale): string {
  return translate(locale, locale === 'zh-CN' ? 'language.zhCN' : locale === 'zh-TW' ? 'language.zhTW' : 'language.en');
}

export function authValidationMessage(locale: SupportedLocale, code: 'required' | 'identifier' | 'password'): string {
  const keys = {
    required: 'auth.validationRequired',
    identifier: 'auth.validationIdentifier',
    password: 'auth.validationPassword',
  } as const;
  return translate(locale, keys[code]);
}

export function authClientErrorMessage(locale: SupportedLocale, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  const keys: Record<string, MessageKey> = {
    '账号服务返回异常，请稍后重试。': 'auth.serviceInvalid',
    '登录状态无效，请重新登录。': 'auth.sessionInvalid',
    '连接账号服务超时，请检查网络后重试。': 'auth.timeout',
    '无法连接账号服务，请检查网络后重试。': 'auth.network',
  };
  if (keys[message]) return translate(locale, keys[message]);
  const status = message.match(/^登录失败（(\d+)）$/)?.[1];
  if (status) return translate(locale, 'auth.httpFailed', { status });
  return message || translate(locale, 'auth.retry');
}

export function localeDateTag(locale: SupportedLocale): string {
  return locale === 'en' ? 'en-US' : locale;
}

const CATEGORY_KEYS: Record<string, MessageKey> = {
  '热门头条': 'news.categoryHot',
  '美国时政': 'news.categoryUsPolitics',
  '美国警情': 'news.categoryUsPublicSafety',
  '移民美国': 'news.categoryImmigration',
  'ICE执法动态': 'news.categoryIce',
};

export function newsCategoryName(locale: SupportedLocale, category: unknown): string {
  const value = String(category || '').trim();
  const key = CATEGORY_KEYS[value];
  return key ? translate(locale, key) : value || translate(locale, 'news.categoryFallback');
}
