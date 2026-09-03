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
  'common.back': '返回', 'profile.heading': '我的', 'profile.loggedIn': '已登入 · {account}', 'profile.guest': '訪客模式 · 無需註冊即可閱讀全部公開內容', 'profile.authWarning': '目前版本尚未設定正式身分服務環境變數。', 'profile.login': '登入 / 建立帳戶',
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
  'common.back': 'Back', 'profile.heading': 'Me', 'profile.loggedIn': 'Signed in · {account}', 'profile.guest': 'Guest mode · Read all public stories without an account', 'profile.authWarning': 'Production identity service is not configured in this build.', 'profile.login': 'Sign in / Create account',
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
