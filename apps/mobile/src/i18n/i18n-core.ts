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
  'news.retry': '重新尝试',
  'news.retrying': '正在重试…',
  'news.loadFailed': '新闻加载失败',
  'news.offline': '网络不可用，正在显示上次读取的新闻。下拉即可重试。',
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
  'america.heading': '美国时政',
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
  'article.unavailableTitle': '暂时无法读取这篇文章',
  'article.unavailableBody': '文章可能尚未发布或已经下线。',
  'article.loadFailed': '文章加载失败',
  'article.retry': '重试',
  'article.offline': '网络不可用，正在显示此前读取的离线副本。恢复网络后请重试。',
  'article.reconnect': '重新连接',
  'article.openCategory': '进入{category}栏目',
  'article.authorFallback': '唐人日报',
  'article.contentUnavailable': '正文暂不可用。',
  'article.originalLanguage': '标题与正文按唐人日报已发布原文显示。',
  'article.continueReading': '继续阅读',
  'article.previous': '‹ 上一条',
  'article.next': '下一条 ›',
  'article.previousA11y': '上一条：{title}',
  'article.nextA11y': '下一条：{title}',
  'article.copiedTitle': '已复制',
  'article.copiedBody': '文章链接已经复制到剪贴板。',
  'article.saved': '已收藏',
  'article.save': '收藏新闻',
  'article.share': '分享新闻',
  'article.copyLink': '复制链接',
  'article.openWebsite': '在网站打开',
  'article.related': '相关文章',
  'article.checkingTranslation': '正在检查是否有已审核翻译…',
  'article.reviewedTranslation': '已审核翻译 · 可随时切换回正式原文',
  'article.showOriginal': '显示正式原文',
  'article.showTranslation': '显示已审核翻译',
  'inbox.screenTitle': '消息中心', 'inbox.heading': '消息中心', 'inbox.markAllA11y': '将全部消息标为已读', 'inbox.markCategoryA11y': '将{category}消息标为已读', 'inbox.processing': '处理中…', 'inbox.markAll': '全部已读', 'inbox.markCategory': '本类已读', 'inbox.filterA11y': '筛选{category}通知',
  'inbox.cacheNotice': '正在显示此账号上次读取的消息，并尝试同步最新内容。', 'inbox.loadingTitle': '正在读取消息', 'inbox.loadingBody': '正在同步回复、关注和系统通知。', 'inbox.timeout': '消息读取超时，请检查网络后重试。', 'inbox.loadFailed': '消息加载失败', 'inbox.loadErrorTitle': '消息暂时无法读取', 'inbox.reload': '重新读取', 'inbox.refreshErrorTitle': '最新消息同步失败', 'inbox.resync': '重新同步',
  'inbox.emptyAllTitle': '暂时没有新消息', 'inbox.emptyCategoryTitle': '暂无{category}消息', 'inbox.emptyAllBody': '收到回复、关注、聊天申请或系统通知后，会显示在这里。', 'inbox.emptyCategoryBody': '此分类收到新消息后，会显示在这里。', 'inbox.openA11y': '打开消息：{title}', 'inbox.pageTimeout': '较早消息读取超时，请检查网络后重试。', 'inbox.pageFailed': '较早消息读取失败', 'inbox.pageErrorTitle': '较早消息暂时无法读取', 'inbox.retryPage': '重试加载', 'inbox.loadingMore': '正在加载…', 'inbox.loadingMoreA11y': '正在加载较早消息', 'inbox.loadMore': '加载更多消息', 'inbox.actionFailed': '操作失败', 'inbox.retryLater': '请稍后重试。', 'inbox.signInRequired': '请先登录以查看消息。', 'inbox.markTimeout': '标记已读超时，请检查网络后重试。',
  'inbox.category.all': '全部', 'inbox.category.replies': '回复', 'inbox.category.likes': '点赞', 'inbox.category.follows': '关注', 'inbox.category.messages': '私信', 'inbox.category.moderation': '审核与系统',
  'inbox.notice.commentReply': '有人回复了你', 'inbox.notice.commentLike': '有人赞了你的评论', 'inbox.notice.communityReply': '有人回复了你的社区评论', 'inbox.notice.communityPostLike': '有人赞了你的社区帖子', 'inbox.notice.communityCommentLike': '有人赞了你的社区评论', 'inbox.notice.communityReport': '你的社区举报有新进展', 'inbox.notice.follow': '你有新的关注者', 'inbox.notice.followRequest': '你有新的关注申请', 'inbox.notice.followAccept': '你的关注申请已通过', 'inbox.notice.messageRequest': '你收到一条聊天申请', 'inbox.notice.message': '你收到一条新私信', 'inbox.notice.system': '系统通知',
  'push.back': '‹ 返回', 'push.heading': '推送设置', 'push.description': '只接收你关心的唐人日报更新，可随时关闭。', 'push.loadFailed': '无法读取推送设置', 'push.retryLater': '请稍后重试', 'push.pendingTitle': '通知尚未开启', 'push.allowPrompt': '请允许唐人日报发送通知。', 'push.systemPrompt': '请在系统设置中允许唐人日报发送通知。', 'push.enableFailed': '开启失败', 'push.disableFailed': '关闭失败', 'push.networkRetry': '请检查网络后重试', 'push.saveFailed': '保存失败',
  'push.deviceTitle': '允许本设备接收通知', 'push.enabled': '已开启', 'push.permissionDenied': '系统权限未开启', 'push.disabled': '未开启', 'push.openSystemSettings': '打开系统通知设置', 'push.types': '通知类型', 'push.footnote': '关闭本设备通知不会影响你在其他设备上的设置。',
  'push.breakingNews': '重大新闻', 'push.breakingNewsMeta': '重要突发与头条更新', 'push.ice': 'ICE 动态', 'push.iceMeta': '执法、拘留与政策变化', 'push.immigration': '移民资讯', 'push.immigrationMeta': '签证、庇护与移民政策', 'push.legal': '判例新规', 'push.legalMeta': '法院判例与法规更新', 'push.comments': '评论与回复', 'push.commentsMeta': '新闻及社区评论的新回复', 'push.likes': '点赞', 'push.likesMeta': '新闻评论、帖子及社区评论获赞', 'push.follows': '关注动态', 'push.followsMeta': '新关注、关注申请及通过结果', 'push.messages': '私信', 'push.messagesMeta': '聊天申请及新消息', 'push.moderation': '审核结果', 'push.moderationMeta': '社区举报处理结果',
  'community.screenTitle': '移民社区', 'community.detailScreenTitle': '社区帖子', 'community.heading': '真实经历，彼此互助', 'community.publish': '发布帖子', 'community.signInToPost': '登录后发帖', 'community.publishFirst': '发布第一篇', 'community.filterA11y': '查看{category}帖子', 'community.pending': '审核中', 'community.user': '用户', 'community.userFallback': '唐人用户',
  'community.category.all': '全部', 'community.category.hotDiscussion': '热门讨论', 'community.category.immigrationHelp': '移民互助', 'community.category.courtExperience': '上庭交流', 'community.category.uscisInterview': 'USCIS 面谈', 'community.category.iceExperience': 'ICE 经历', 'community.category.lawyerReview': '律师点评', 'community.category.tipoff': '投稿爆料',
  'community.timeout': '社区读取超时，请检查网络后重试。', 'community.loadFailed': '社区加载失败', 'community.loadingTitle': '正在读取社区', 'community.loadingBody': '正在同步最新公开帖子。', 'community.cacheNotice': '正在显示上次读取的公开帖子，并尝试同步最新内容。', 'community.errorTitle': '社区暂时无法读取', 'community.reload': '重新读取', 'community.emptyAll': '暂时还没有公开帖子', 'community.emptyCategory': '{category}暂时没有公开帖子', 'community.emptyBody': '可以发布真实经历、提出问题，或分享移民与上庭经验。', 'community.openPostA11y': '打开帖子：{title}',
  'community.pageTimeout': '较早帖子读取超时，请检查网络后重试。', 'community.pageFailed': '较早帖子读取失败', 'community.pageErrorTitle': '较早帖子暂时无法读取', 'community.retryPage': '重试加载', 'community.loadingMore': '正在加载…', 'community.loadingMoreA11y': '正在加载较早帖子', 'community.loadMore': '加载更多帖子', 'community.loadMoreA11y': '加载更多社区帖子', 'community.retry': '重试', 'community.processing': '处理中…',
  'community.likeTimeout': '点赞操作超时，请检查网络后重试。', 'community.likeTimeoutShort': '点赞操作超时，请重试。', 'community.likeFailed': '点赞操作失败，请重试。', 'community.likeFailure': '点赞失败', 'community.likeActionFailed': '点赞操作失败', 'community.liked': '已点赞', 'community.unliked': '已取消点赞', 'community.postUpdated': '帖子状态已更新。', 'community.likeA11y': '点赞，当前{count}个赞', 'community.unlikeA11y': '取消点赞，当前{count}个赞', 'community.signInToLike': '登录后点赞', 'community.likeCount': '赞 {count}', 'community.likedCount': '已赞 {count}', 'community.commentCount': '评论 {count}', 'community.retryLikeA11y': '重试点赞操作',
  'community.detailTimeout': '帖子读取超时，请检查网络后重试。', 'community.detailLoadFailed': '帖子加载失败', 'community.detailLoadingTitle': '正在读取帖子', 'community.detailLoadingBody': '正在同步最新内容和评论…', 'community.detailErrorTitle': '暂时无法读取帖子', 'community.detailUnavailable': '帖子可能已下架或暂时不可访问。', 'community.viewProfileA11y': '查看{name}的主页', 'community.report': '举报', 'community.reportPost': '举报帖子', 'community.reportReason': '举报理由', 'community.reportPlaceholder': '请简要说明举报理由', 'community.submitReport': '提交举报', 'community.retryAction': '重试操作', 'community.syncing': '正在后台同步帖子和评论…', 'community.refreshFailedTitle': '刷新失败，已保留当前内容', 'community.refreshAgain': '重新刷新',
  'community.commentSubmitTimeout': '评论提交超时，请重试。', 'community.commentSubmitted': '评论已提交', 'community.commentPublished': '评论发布成功', 'community.commentPendingBody': '评论正在等待审核。', 'community.commentPublishedBody': '你的评论已显示在帖子中。', 'community.commentSubmitFailed': '评论提交失败', 'community.commentFailed': '评论失败', 'community.reportTimeout': '举报提交超时，请重试。', 'community.reportSubmitted': '举报已提交', 'community.reportReviewBody': '管理员会进行审核。', 'community.reportFailed': '举报提交失败', 'community.reportFailure': '举报失败',
  'community.unpublishPost': '下架帖子', 'community.unpublishPostConfirm': '下架后帖子将不再公开显示，确定继续吗？', 'community.cancel': '取消', 'community.confirmUnpublish': '确定下架', 'community.unpublishPostTimeout': '帖子下架超时，请重试。', 'community.unpublishPostFailed': '帖子下架失败', 'community.unpublishFailed': '下架失败', 'community.unpublishComment': '下架评论', 'community.unpublishCommentConfirm': '下架后评论将不再公开显示，回复仍会保留。确定继续吗？', 'community.unpublishCommentTimeout': '评论下架超时，请重试。', 'community.commentUnpublished': '评论已下架', 'community.commentUnpublishedBody': '这条评论已从公开列表移除。', 'community.unpublishCommentFailed': '评论下架失败',
  'community.targetLocated': '已定位到通知对应评论', 'community.earlierThreadsA11y': '查看更早的{count}组评论', 'community.earlierThreads': '查看更早评论（还有 {count} 组）', 'community.replyTo': '回复 {name}', 'community.commentReviewing': '审核中，仅自己可见', 'community.likeCommentA11y': '点赞评论，当前{count}个赞', 'community.unlikeCommentA11y': '取消点赞评论，当前{count}个赞', 'community.reply': '回复', 'community.replyA11y': '回复{name}', 'community.reportComment': '举报这条评论', 'community.unpublishOwnComment': '下架自己的评论', 'community.unpublishing': '下架中…', 'community.unpublish': '下架', 'community.commentLikeTimeout': '评论点赞超时，请重试。', 'community.commentLikeFailed': '评论点赞失败', 'community.retryCommentLike': '重试评论点赞',
  'community.commentReportTimeout': '评论举报超时，请重试。', 'community.commentReportReviewBody': '管理员会审核这条评论。', 'community.commentReportFailed': '评论举报失败', 'community.commentReportReason': '评论举报理由', 'community.cancelCommentReport': '取消举报评论', 'community.retrySubmitCommentReport': '重试提交评论举报', 'community.submitCommentReport': '提交评论举报', 'community.submitting': '提交中…', 'community.retryReport': '重试举报', 'community.noComments': '暂时还没有评论。', 'community.draftRestored': '已恢复评论草稿。', 'community.draftRestoredReply': '已恢复评论草稿，将回复 {name}。', 'community.replyingTo': '正在回复 {name}', 'community.cancelReply': '取消回复', 'community.commentContent': '评论内容', 'community.replyPlaceholder': '回复 {name}', 'community.commentPlaceholder': '写下你的评论', 'community.draftCounter': '{count}/3000 · 草稿自动保存 7 天', 'community.publishReply': '发表回复', 'community.publishComment': '发表评论', 'community.signInToComment': '登录后发表评论',
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
  'profile.fontPreview': '唐人日报正文预览 Aa',
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
  'news.loading': '正在讀取最新內容…', 'news.retry': '重新嘗試', 'news.retrying': '正在重試…', 'news.loadFailed': '新聞載入失敗', 'news.offline': '網路無法使用，正在顯示上次讀取的新聞。下拉即可重試。', 'news.empty': '目前沒有符合條件的新聞。', 'news.end': '已經到底了', 'news.openArticle': '開啟新聞：{title}', 'news.categoryPage': '新聞欄目', 'news.categoryFallback': '新聞', 'news.categoryHot': '中國熱門頭條', 'news.categoryUsPolitics': '美國時政', 'news.categoryUsPublicSafety': '美國警情', 'news.categoryImmigration': '移民美國', 'news.categoryIce': 'ICE 執法動態',
  'america.heading': '美國時政', 'america.subtitle': '美國時政 · 美國警情', 'america.loadFailed': '美國頻道載入失敗', 'america.empty': '暫無最新內容',
  'legal.heading': '美國判例與新規', 'legal.subtitle': '官方法律資料庫 · App 原生詳情', 'legal.databaseError': '法律資料庫 {status}', 'legal.loadFailed': '法律資料庫載入失敗', 'legal.searchPlaceholder': '搜尋案名、案號、引證或機構', 'legal.count': '共 {count} 筆', 'legal.officialSource': '官方法律資料', 'legal.untitled': '未命名法律資料',
  'search.placeholder': '搜尋新聞標題或摘要', 'search.submit': '搜尋', 'search.filter': '欄目：{category} ×', 'search.backHome': '返回搜尋首頁', 'search.queryTitle': '搜尋：{query}', 'search.categoryTitle': '欄目：{category}', 'search.empty': '沒有找到相關已發布新聞。', 'search.trending': '熱搜', 'search.trendingSource': '來自正式已發布新聞資料', 'search.noTrending': '目前沒有可用熱搜資料。', 'search.history': '搜尋紀錄', 'search.clear': '清除', 'search.noHistory': '暫無搜尋紀錄。',
  'auth.screenTitle': '登入 / 註冊', 'auth.heading': '唐人日報帳戶', 'auth.description': '輸入電子郵件或手機號碼和密碼。帳戶不存在時會自動建立並直接登入，不需要額外驗證。', 'auth.notConfiguredTitle': '登入尚未設定', 'auth.notConfiguredBody': '目前版本尚未連接正式身分服務。', 'auth.registerSuccess': '註冊成功', 'auth.signInSuccess': '登入成功', 'auth.registerSuccessBody': '帳戶已建立並登入，無需額外驗證。', 'auth.welcomeBack': '歡迎回來。', 'auth.continue': '繼續', 'auth.identifierPlaceholder': '電子郵件或手機號碼', 'auth.passwordPlaceholder': '密碼（8–128位）', 'auth.busy': '正在登入…', 'auth.submit': '登入 / 註冊', 'auth.guest': '繼續以訪客身分閱讀', 'auth.retry': '請稍後再試', 'auth.validationRequired': '請輸入電子郵件或手機號碼和密碼。', 'auth.validationIdentifier': '請輸入有效的電子郵件或手機號碼。', 'auth.validationPassword': '密碼需要 8–128 位。', 'auth.serviceInvalid': '帳戶服務回應異常，請稍後再試。', 'auth.sessionInvalid': '登入狀態無效，請重新登入。', 'auth.timeout': '連接帳戶服務逾時，請檢查網路後重試。', 'auth.network': '無法連接帳戶服務，請檢查網路後重試。', 'auth.httpFailed': '登入失敗（{status}）',
  'article.unavailableTitle': '暫時無法讀取這篇文章', 'article.unavailableBody': '文章可能尚未發佈或已經下架。', 'article.loadFailed': '文章載入失敗', 'article.retry': '重試', 'article.offline': '網路無法使用，正在顯示先前讀取的離線副本。恢復網路後請重試。', 'article.reconnect': '重新連線', 'article.openCategory': '進入{category}欄目', 'article.authorFallback': '唐人日報', 'article.contentUnavailable': '內文暫時無法使用。', 'article.originalLanguage': '標題與內文按唐人日報已發佈原文顯示。', 'article.continueReading': '繼續閱讀', 'article.previous': '‹ 上一則', 'article.next': '下一則 ›', 'article.previousA11y': '上一則：{title}', 'article.nextA11y': '下一則：{title}', 'article.copiedTitle': '已複製', 'article.copiedBody': '文章連結已複製到剪貼簿。', 'article.saved': '已收藏', 'article.save': '收藏新聞', 'article.share': '分享新聞', 'article.copyLink': '複製連結', 'article.openWebsite': '在網站開啟', 'article.related': '相關文章', 'article.checkingTranslation': '正在檢查是否有已審核翻譯…', 'article.reviewedTranslation': '已審核翻譯 · 可隨時切換回正式原文', 'article.showOriginal': '顯示正式原文', 'article.showTranslation': '顯示已審核翻譯',
  'inbox.screenTitle': '訊息中心', 'inbox.heading': '訊息中心', 'inbox.markAllA11y': '將全部訊息標示為已讀', 'inbox.markCategoryA11y': '將{category}訊息標示為已讀', 'inbox.processing': '處理中…', 'inbox.markAll': '全部已讀', 'inbox.markCategory': '本類已讀', 'inbox.filterA11y': '篩選{category}通知',
  'inbox.cacheNotice': '正在顯示此帳戶上次讀取的訊息，並嘗試同步最新內容。', 'inbox.loadingTitle': '正在讀取訊息', 'inbox.loadingBody': '正在同步回覆、追蹤和系統通知。', 'inbox.timeout': '訊息讀取逾時，請檢查網路後重試。', 'inbox.loadFailed': '訊息載入失敗', 'inbox.loadErrorTitle': '訊息暫時無法讀取', 'inbox.reload': '重新讀取', 'inbox.refreshErrorTitle': '最新訊息同步失敗', 'inbox.resync': '重新同步',
  'inbox.emptyAllTitle': '暫時沒有新訊息', 'inbox.emptyCategoryTitle': '暫無{category}訊息', 'inbox.emptyAllBody': '收到回覆、追蹤、聊天申請或系統通知後，會顯示在這裡。', 'inbox.emptyCategoryBody': '此分類收到新訊息後，會顯示在這裡。', 'inbox.openA11y': '開啟訊息：{title}', 'inbox.pageTimeout': '較早訊息讀取逾時，請檢查網路後重試。', 'inbox.pageFailed': '較早訊息讀取失敗', 'inbox.pageErrorTitle': '較早訊息暫時無法讀取', 'inbox.retryPage': '重試載入', 'inbox.loadingMore': '正在載入…', 'inbox.loadingMoreA11y': '正在載入較早訊息', 'inbox.loadMore': '載入更多訊息', 'inbox.actionFailed': '操作失敗', 'inbox.retryLater': '請稍後重試。', 'inbox.signInRequired': '請先登入以查看訊息。', 'inbox.markTimeout': '標示已讀逾時，請檢查網路後重試。',
  'inbox.category.all': '全部', 'inbox.category.replies': '回覆', 'inbox.category.likes': '按讚', 'inbox.category.follows': '追蹤', 'inbox.category.messages': '私訊', 'inbox.category.moderation': '審核與系統',
  'inbox.notice.commentReply': '有人回覆了你', 'inbox.notice.commentLike': '有人按讚你的評論', 'inbox.notice.communityReply': '有人回覆你的社區評論', 'inbox.notice.communityPostLike': '有人按讚你的社區貼文', 'inbox.notice.communityCommentLike': '有人按讚你的社區評論', 'inbox.notice.communityReport': '你的社區檢舉有新進展', 'inbox.notice.follow': '你有新的追蹤者', 'inbox.notice.followRequest': '你有新的追蹤申請', 'inbox.notice.followAccept': '你的追蹤申請已通過', 'inbox.notice.messageRequest': '你收到一則聊天申請', 'inbox.notice.message': '你收到一則新私訊', 'inbox.notice.system': '系統通知',
  'push.back': '‹ 返回', 'push.heading': '推播設定', 'push.description': '只接收你關心的唐人日報更新，可隨時關閉。', 'push.loadFailed': '無法讀取推播設定', 'push.retryLater': '請稍後重試', 'push.pendingTitle': '通知尚未開啟', 'push.allowPrompt': '請允許唐人日報傳送通知。', 'push.systemPrompt': '請在系統設定中允許唐人日報傳送通知。', 'push.enableFailed': '開啟失敗', 'push.disableFailed': '關閉失敗', 'push.networkRetry': '請檢查網路後重試', 'push.saveFailed': '儲存失敗',
  'push.deviceTitle': '允許本裝置接收通知', 'push.enabled': '已開啟', 'push.permissionDenied': '系統權限未開啟', 'push.disabled': '未開啟', 'push.openSystemSettings': '開啟系統通知設定', 'push.types': '通知類型', 'push.footnote': '關閉本裝置通知不會影響你在其他裝置上的設定。',
  'push.breakingNews': '重大新聞', 'push.breakingNewsMeta': '重要突發與頭條更新', 'push.ice': 'ICE 動態', 'push.iceMeta': '執法、拘留與政策變化', 'push.immigration': '移民資訊', 'push.immigrationMeta': '簽證、庇護與移民政策', 'push.legal': '判例新規', 'push.legalMeta': '法院判例與法規更新', 'push.comments': '評論與回覆', 'push.commentsMeta': '新聞及社區評論的新回覆', 'push.likes': '按讚', 'push.likesMeta': '新聞評論、貼文及社區評論獲讚', 'push.follows': '追蹤動態', 'push.followsMeta': '新追蹤、追蹤申請及通過結果', 'push.messages': '私訊', 'push.messagesMeta': '聊天申請及新訊息', 'push.moderation': '審核結果', 'push.moderationMeta': '社區檢舉處理結果',
  'community.screenTitle': '移民社區', 'community.detailScreenTitle': '社區貼文', 'community.heading': '真實經歷，彼此互助', 'community.publish': '發佈貼文', 'community.signInToPost': '登入後發文', 'community.publishFirst': '發佈第一篇', 'community.filterA11y': '查看{category}貼文', 'community.pending': '審核中', 'community.user': '使用者', 'community.userFallback': '唐人使用者',
  'community.category.all': '全部', 'community.category.hotDiscussion': '熱門討論', 'community.category.immigrationHelp': '移民互助', 'community.category.courtExperience': '出庭交流', 'community.category.uscisInterview': 'USCIS 面談', 'community.category.iceExperience': 'ICE 經歷', 'community.category.lawyerReview': '律師點評', 'community.category.tipoff': '投稿爆料',
  'community.timeout': '社區讀取逾時，請檢查網路後重試。', 'community.loadFailed': '社區載入失敗', 'community.loadingTitle': '正在讀取社區', 'community.loadingBody': '正在同步最新公開貼文。', 'community.cacheNotice': '正在顯示上次讀取的公開貼文，並嘗試同步最新內容。', 'community.errorTitle': '社區暫時無法讀取', 'community.reload': '重新讀取', 'community.emptyAll': '暫時還沒有公開貼文', 'community.emptyCategory': '{category}暫時沒有公開貼文', 'community.emptyBody': '可以發佈真實經歷、提出問題，或分享移民與出庭經驗。', 'community.openPostA11y': '開啟貼文：{title}',
  'community.pageTimeout': '較早貼文讀取逾時，請檢查網路後重試。', 'community.pageFailed': '較早貼文讀取失敗', 'community.pageErrorTitle': '較早貼文暫時無法讀取', 'community.retryPage': '重試載入', 'community.loadingMore': '正在載入…', 'community.loadingMoreA11y': '正在載入較早貼文', 'community.loadMore': '載入更多貼文', 'community.loadMoreA11y': '載入更多社區貼文', 'community.retry': '重試', 'community.processing': '處理中…',
  'community.likeTimeout': '按讚操作逾時，請檢查網路後重試。', 'community.likeTimeoutShort': '按讚操作逾時，請重試。', 'community.likeFailed': '按讚操作失敗，請重試。', 'community.likeFailure': '按讚失敗', 'community.likeActionFailed': '按讚操作失敗', 'community.liked': '已按讚', 'community.unliked': '已取消按讚', 'community.postUpdated': '貼文狀態已更新。', 'community.likeA11y': '按讚，目前{count}個讚', 'community.unlikeA11y': '取消按讚，目前{count}個讚', 'community.signInToLike': '登入後按讚', 'community.likeCount': '讚 {count}', 'community.likedCount': '已讚 {count}', 'community.commentCount': '評論 {count}', 'community.retryLikeA11y': '重試按讚操作',
  'community.detailTimeout': '貼文讀取逾時，請檢查網路後重試。', 'community.detailLoadFailed': '貼文載入失敗', 'community.detailLoadingTitle': '正在讀取貼文', 'community.detailLoadingBody': '正在同步最新內容和評論…', 'community.detailErrorTitle': '暫時無法讀取貼文', 'community.detailUnavailable': '貼文可能已下架或暫時無法存取。', 'community.viewProfileA11y': '查看{name}的個人頁面', 'community.report': '檢舉', 'community.reportPost': '檢舉貼文', 'community.reportReason': '檢舉理由', 'community.reportPlaceholder': '請簡要說明檢舉理由', 'community.submitReport': '提交檢舉', 'community.retryAction': '重試操作', 'community.syncing': '正在背景同步貼文和評論…', 'community.refreshFailedTitle': '重新整理失敗，已保留目前內容', 'community.refreshAgain': '重新整理',
  'community.commentSubmitTimeout': '評論提交逾時，請重試。', 'community.commentSubmitted': '評論已提交', 'community.commentPublished': '評論發佈成功', 'community.commentPendingBody': '評論正在等待審核。', 'community.commentPublishedBody': '你的評論已顯示在貼文中。', 'community.commentSubmitFailed': '評論提交失敗', 'community.commentFailed': '評論失敗', 'community.reportTimeout': '檢舉提交逾時，請重試。', 'community.reportSubmitted': '檢舉已提交', 'community.reportReviewBody': '管理員會進行審核。', 'community.reportFailed': '檢舉提交失敗', 'community.reportFailure': '檢舉失敗',
  'community.unpublishPost': '下架貼文', 'community.unpublishPostConfirm': '下架後貼文將不再公開顯示，確定繼續嗎？', 'community.cancel': '取消', 'community.confirmUnpublish': '確定下架', 'community.unpublishPostTimeout': '貼文下架逾時，請重試。', 'community.unpublishPostFailed': '貼文下架失敗', 'community.unpublishFailed': '下架失敗', 'community.unpublishComment': '下架評論', 'community.unpublishCommentConfirm': '下架後評論將不再公開顯示，回覆仍會保留。確定繼續嗎？', 'community.unpublishCommentTimeout': '評論下架逾時，請重試。', 'community.commentUnpublished': '評論已下架', 'community.commentUnpublishedBody': '這則評論已從公開列表移除。', 'community.unpublishCommentFailed': '評論下架失敗',
  'community.targetLocated': '已定位到通知對應評論', 'community.earlierThreadsA11y': '查看較早的{count}組評論', 'community.earlierThreads': '查看較早評論（還有 {count} 組）', 'community.replyTo': '回覆 {name}', 'community.commentReviewing': '審核中，僅自己可見', 'community.likeCommentA11y': '按讚評論，目前{count}個讚', 'community.unlikeCommentA11y': '取消按讚評論，目前{count}個讚', 'community.reply': '回覆', 'community.replyA11y': '回覆{name}', 'community.reportComment': '檢舉這則評論', 'community.unpublishOwnComment': '下架自己的評論', 'community.unpublishing': '下架中…', 'community.unpublish': '下架', 'community.commentLikeTimeout': '評論按讚逾時，請重試。', 'community.commentLikeFailed': '評論按讚失敗', 'community.retryCommentLike': '重試評論按讚',
  'community.commentReportTimeout': '評論檢舉逾時，請重試。', 'community.commentReportReviewBody': '管理員會審核這則評論。', 'community.commentReportFailed': '評論檢舉失敗', 'community.commentReportReason': '評論檢舉理由', 'community.cancelCommentReport': '取消檢舉評論', 'community.retrySubmitCommentReport': '重試提交評論檢舉', 'community.submitCommentReport': '提交評論檢舉', 'community.submitting': '提交中…', 'community.retryReport': '重試檢舉', 'community.noComments': '暫時還沒有評論。', 'community.draftRestored': '已恢復評論草稿。', 'community.draftRestoredReply': '已恢復評論草稿，將回覆 {name}。', 'community.replyingTo': '正在回覆 {name}', 'community.cancelReply': '取消回覆', 'community.commentContent': '評論內容', 'community.replyPlaceholder': '回覆 {name}', 'community.commentPlaceholder': '寫下你的評論', 'community.draftCounter': '{count}/3000 · 草稿自動儲存 7 天', 'community.publishReply': '發佈回覆', 'community.publishComment': '發表評論', 'community.signInToComment': '登入後發表評論',
  'profile.heading': '我的', 'profile.loggedIn': '已登入 · {account}', 'profile.guest': '訪客模式 · 無需註冊即可閱讀全部公開內容', 'profile.authWarning': '目前版本尚未設定正式身分服務環境變數。', 'profile.login': '登入 / 建立帳戶',
  'profile.community': '移民社區', 'profile.communityMemberMeta': '瀏覽貼文、分享經歷和提出問題', 'profile.communityGuestMeta': '瀏覽無需登入；發文時再登入或註冊', 'profile.notifications': '訊息中心', 'profile.unread': ' · {count}則未讀', 'profile.notificationsMeta': '回覆、按讚、追蹤與系統通知',
  'profile.comments': '我的評論', 'profile.commentsMeta': '查看評論狀態並返回對應新聞', 'profile.favorites': '收藏', 'profile.favoritesMeta': '本機與帳戶雲端收藏自動安全合併', 'profile.localFavorites': '本機收藏', 'profile.localFavoritesMeta': '登入前繼續保存在目前裝置',
  'profile.history': '閱讀紀錄', 'profile.historyMeta': '本機與帳戶雲端紀錄自動合併，最多100則', 'profile.localHistory': '本機閱讀紀錄', 'profile.localHistoryMeta': '登入前繼續保存在目前裝置', 'profile.accountSettings': '帳戶設定', 'profile.accountSettingsMeta': '修改暱稱、預設頭像與公開簡介',
  'profile.signOut': '登出', 'profile.signOutFailed': '登出失敗', 'profile.pushDisableFailed': '無法停用本裝置通知', 'profile.pushDisableFailedMeta': '網路異常時登出後仍可能收到通知。可以先在系統設定關閉通知，或仍然登出。', 'profile.cancel': '取消', 'profile.signOutAnyway': '仍然登出',
  'profile.fontSize': '閱讀字級', 'profile.fontSizeMeta': '統一設定新聞內文字級，之後所有新聞詳情頁會自動使用此字級', 'profile.fontSmall': '小', 'profile.fontStandard': '標準', 'profile.fontLarge': '大', 'profile.fontExtraLarge': '特大', 'profile.fontPreview': '唐人日報正文預覽 Aa',
  'profile.pushSettings': '推播設定', 'profile.pushSettingsMeta': '重大新聞 · ICE · 移民 · 判例新規 · 社區互動', 'profile.pushSettingsGuestMeta': '登入後選擇通知類型', 'profile.language': '語言', 'profile.languageMeta': '目前：{language}', 'profile.openWebsite': '開啟 trrb.net', 'profile.openWebsiteMeta': '造訪唐人日報網站',
  'language.heading': '語言設定', 'language.description': '介面語言會保存在本裝置。選擇「跟隨系統」時，App 會自動使用支援的系統語言。', 'language.system': '跟隨系統', 'language.systemMeta': '自動識別簡體中文、繁體中文或英文', 'language.zhCN': '简体中文', 'language.zhCNMeta': 'Simplified Chinese', 'language.zhTW': '繁體中文', 'language.zhTWMeta': 'Traditional Chinese', 'language.en': 'English', 'language.enMeta': '英文', 'language.selected': '已選擇',
};

const en: Record<MessageKey, string> = {
  'tab.home': 'Home', 'tab.homeIcon': 'H', 'tab.america': 'U.S.', 'tab.americaIcon': 'U', 'tab.immigration': 'Immigration', 'tab.immigrationIcon': 'I', 'tab.legal': 'Legal', 'tab.legalIcon': 'L', 'tab.profile': 'Me', 'tab.profileIcon': 'M',
  'common.back': 'Back',
  'news.loading': 'Loading the latest stories…', 'news.retry': 'Try again', 'news.retrying': 'Retrying…', 'news.loadFailed': 'Could not load stories', 'news.offline': 'You are offline. Previously loaded stories are shown. Pull down to retry.', 'news.empty': 'No matching published stories yet.', 'news.end': 'You have reached the end', 'news.openArticle': 'Open story: {title}', 'news.categoryPage': 'News category', 'news.categoryFallback': 'News', 'news.categoryHot': 'China Top Stories', 'news.categoryUsPolitics': 'U.S. Politics', 'news.categoryUsPublicSafety': 'U.S. Public Safety', 'news.categoryImmigration': 'U.S. Immigration', 'news.categoryIce': 'ICE Enforcement',
  'america.heading': 'U.S. politics', 'america.subtitle': 'U.S. politics · Public safety', 'america.loadFailed': 'Could not load the U.S. channel', 'america.empty': 'No new stories yet',
  'legal.heading': 'U.S. Cases & Rules', 'legal.subtitle': 'Official legal sources · Native app details', 'legal.databaseError': 'Legal database {status}', 'legal.loadFailed': 'Could not load the legal database', 'legal.searchPlaceholder': 'Search title, docket, citation or agency', 'legal.count': '{count} records', 'legal.officialSource': 'Official legal source', 'legal.untitled': 'Untitled legal record',
  'search.placeholder': 'Search story titles or summaries', 'search.submit': 'Search', 'search.filter': 'Category: {category} ×', 'search.backHome': 'Back to search', 'search.queryTitle': 'Search: {query}', 'search.categoryTitle': 'Category: {category}', 'search.empty': 'No matching published stories found.', 'search.trending': 'Trending', 'search.trendingSource': 'From published news data', 'search.noTrending': 'Trending data is not available yet.', 'search.history': 'Search history', 'search.clear': 'Clear', 'search.noHistory': 'No search history yet.',
  'auth.screenTitle': 'Sign in / Register', 'auth.heading': 'Tangren Daily account', 'auth.description': 'Enter your email address or phone number and password. If the account does not exist, it will be created and signed in immediately without another verification step.', 'auth.notConfiguredTitle': 'Sign-in is not configured', 'auth.notConfiguredBody': 'This build is not connected to the production identity service.', 'auth.registerSuccess': 'Registration successful', 'auth.signInSuccess': 'Sign-in successful', 'auth.registerSuccessBody': 'Your account was created and signed in. No additional verification is required.', 'auth.welcomeBack': 'Welcome back.', 'auth.continue': 'Continue', 'auth.identifierPlaceholder': 'Email address or phone number', 'auth.passwordPlaceholder': 'Password (8–128 characters)', 'auth.busy': 'Signing in…', 'auth.submit': 'Sign in / Register', 'auth.guest': 'Continue reading as a guest', 'auth.retry': 'Please try again later', 'auth.validationRequired': 'Enter your email address or phone number and password.', 'auth.validationIdentifier': 'Enter a valid email address or phone number.', 'auth.validationPassword': 'Password must be 8–128 characters.', 'auth.serviceInvalid': 'The account service returned an invalid response. Try again later.', 'auth.sessionInvalid': 'Your sign-in session is invalid. Sign in again.', 'auth.timeout': 'The account service timed out. Check your connection and try again.', 'auth.network': 'Could not reach the account service. Check your connection and try again.', 'auth.httpFailed': 'Sign-in failed ({status})',
  'article.unavailableTitle': 'This story is unavailable', 'article.unavailableBody': 'The story may not be published yet or may have been taken down.', 'article.loadFailed': 'Could not load the story', 'article.retry': 'Try again', 'article.offline': 'You are offline. A previously saved copy is shown. Reconnect and try again for the latest version.', 'article.reconnect': 'Reconnect', 'article.openCategory': 'Open the {category} category', 'article.authorFallback': 'Tangren Daily', 'article.contentUnavailable': 'The article text is not available.', 'article.originalLanguage': 'The headline and article text are shown in their published source language.', 'article.continueReading': 'Continue reading', 'article.previous': '‹ Previous', 'article.next': 'Next ›', 'article.previousA11y': 'Previous story: {title}', 'article.nextA11y': 'Next story: {title}', 'article.copiedTitle': 'Copied', 'article.copiedBody': 'The story link was copied to the clipboard.', 'article.saved': 'Saved', 'article.save': 'Save story', 'article.share': 'Share story', 'article.copyLink': 'Copy link', 'article.openWebsite': 'Open on website', 'article.related': 'Related stories', 'article.checkingTranslation': 'Checking for a reviewed translation…', 'article.reviewedTranslation': 'Reviewed translation · switch back to the published source at any time', 'article.showOriginal': 'Show published source', 'article.showTranslation': 'Show reviewed translation',
  'inbox.screenTitle': 'Notifications', 'inbox.heading': 'Notifications', 'inbox.markAllA11y': 'Mark all notifications as read', 'inbox.markCategoryA11y': 'Mark all {category} notifications as read', 'inbox.processing': 'Working…', 'inbox.markAll': 'Mark all read', 'inbox.markCategory': 'Mark category read', 'inbox.filterA11y': 'Filter {category} notifications',
  'inbox.cacheNotice': 'Showing notifications previously read by this account while checking for updates.', 'inbox.loadingTitle': 'Loading notifications', 'inbox.loadingBody': 'Syncing replies, follows and system notifications.', 'inbox.timeout': 'Loading notifications timed out. Check your connection and try again.', 'inbox.loadFailed': 'Could not load notifications', 'inbox.loadErrorTitle': 'Notifications are unavailable', 'inbox.reload': 'Reload', 'inbox.refreshErrorTitle': 'Could not sync the latest notifications', 'inbox.resync': 'Sync again',
  'inbox.emptyAllTitle': 'No new notifications', 'inbox.emptyCategoryTitle': 'No {category} notifications', 'inbox.emptyAllBody': 'Replies, follows, chat requests and system notices will appear here.', 'inbox.emptyCategoryBody': 'New notifications in this category will appear here.', 'inbox.openA11y': 'Open notification: {title}', 'inbox.pageTimeout': 'Loading older notifications timed out. Check your connection and try again.', 'inbox.pageFailed': 'Could not load older notifications', 'inbox.pageErrorTitle': 'Older notifications are unavailable', 'inbox.retryPage': 'Try again', 'inbox.loadingMore': 'Loading…', 'inbox.loadingMoreA11y': 'Loading older notifications', 'inbox.loadMore': 'Load more notifications', 'inbox.actionFailed': 'Action failed', 'inbox.retryLater': 'Try again later.', 'inbox.signInRequired': 'Sign in to view notifications.', 'inbox.markTimeout': 'Marking notifications as read timed out. Check your connection and try again.',
  'inbox.category.all': 'All', 'inbox.category.replies': 'Replies', 'inbox.category.likes': 'Likes', 'inbox.category.follows': 'Follows', 'inbox.category.messages': 'Messages', 'inbox.category.moderation': 'Moderation & system',
  'inbox.notice.commentReply': 'Someone replied to you', 'inbox.notice.commentLike': 'Someone liked your comment', 'inbox.notice.communityReply': 'Someone replied to your community comment', 'inbox.notice.communityPostLike': 'Someone liked your community post', 'inbox.notice.communityCommentLike': 'Someone liked your community comment', 'inbox.notice.communityReport': 'Your community report has an update', 'inbox.notice.follow': 'You have a new follower', 'inbox.notice.followRequest': 'You have a new follow request', 'inbox.notice.followAccept': 'Your follow request was accepted', 'inbox.notice.messageRequest': 'You received a chat request', 'inbox.notice.message': 'You received a new message', 'inbox.notice.system': 'System notification',
  'push.back': '‹ Back', 'push.heading': 'Push notifications', 'push.description': 'Receive only the Tangren Daily updates you care about. Turn them off at any time.', 'push.loadFailed': 'Could not load push settings', 'push.retryLater': 'Try again later', 'push.pendingTitle': 'Notifications are not enabled', 'push.allowPrompt': 'Allow Tangren Daily to send notifications.', 'push.systemPrompt': 'Allow Tangren Daily notifications in system settings.', 'push.enableFailed': 'Could not enable notifications', 'push.disableFailed': 'Could not disable notifications', 'push.networkRetry': 'Check your connection and try again', 'push.saveFailed': 'Could not save',
  'push.deviceTitle': 'Allow notifications on this device', 'push.enabled': 'Enabled', 'push.permissionDenied': 'System permission is off', 'push.disabled': 'Not enabled', 'push.openSystemSettings': 'Open system notification settings', 'push.types': 'Notification types', 'push.footnote': 'Turning off notifications on this device does not change your other devices.',
  'push.breakingNews': 'Breaking news', 'push.breakingNewsMeta': 'Important breaking stories and headlines', 'push.ice': 'ICE updates', 'push.iceMeta': 'Enforcement, detention and policy changes', 'push.immigration': 'Immigration news', 'push.immigrationMeta': 'Visas, asylum and immigration policy', 'push.legal': 'Cases & rules', 'push.legalMeta': 'Court decisions and regulatory updates', 'push.comments': 'Comments & replies', 'push.commentsMeta': 'New replies to news and community comments', 'push.likes': 'Likes', 'push.likesMeta': 'Likes on news comments, posts and community comments', 'push.follows': 'Follow activity', 'push.followsMeta': 'New follows, requests and approvals', 'push.messages': 'Messages', 'push.messagesMeta': 'Chat requests and new messages', 'push.moderation': 'Moderation results', 'push.moderationMeta': 'Updates on community reports',
  'community.screenTitle': 'Immigration Community', 'community.detailScreenTitle': 'Community post', 'community.heading': 'Real experiences, mutual support', 'community.publish': 'Create post', 'community.signInToPost': 'Sign in to post', 'community.publishFirst': 'Create the first post', 'community.filterA11y': 'View {category} posts', 'community.pending': 'In review', 'community.user': 'User', 'community.userFallback': 'Tangren user',
  'community.category.all': 'All', 'community.category.hotDiscussion': 'Popular', 'community.category.immigrationHelp': 'Immigration help', 'community.category.courtExperience': 'Court experiences', 'community.category.uscisInterview': 'USCIS interviews', 'community.category.iceExperience': 'ICE experiences', 'community.category.lawyerReview': 'Legal perspectives', 'community.category.tipoff': 'Tips & submissions',
  'community.timeout': 'Loading the community timed out. Check your connection and try again.', 'community.loadFailed': 'Could not load the community', 'community.loadingTitle': 'Loading community', 'community.loadingBody': 'Syncing the latest public posts.', 'community.cacheNotice': 'Showing previously loaded public posts while checking for updates.', 'community.errorTitle': 'Community is unavailable', 'community.reload': 'Reload', 'community.emptyAll': 'No public posts yet', 'community.emptyCategory': 'No public posts in {category}', 'community.emptyBody': 'Share a real experience, ask a question, or discuss immigration and court experiences.', 'community.openPostA11y': 'Open post: {title}',
  'community.pageTimeout': 'Loading older posts timed out. Check your connection and try again.', 'community.pageFailed': 'Could not load older posts', 'community.pageErrorTitle': 'Older posts are unavailable', 'community.retryPage': 'Try again', 'community.loadingMore': 'Loading…', 'community.loadingMoreA11y': 'Loading older posts', 'community.loadMore': 'Load more posts', 'community.loadMoreA11y': 'Load more community posts', 'community.retry': 'Retry', 'community.processing': 'Working…',
  'community.likeTimeout': 'The like action timed out. Check your connection and try again.', 'community.likeTimeoutShort': 'The like action timed out. Try again.', 'community.likeFailed': 'The like action failed. Try again.', 'community.likeFailure': 'Could not update like', 'community.likeActionFailed': 'Like action failed', 'community.liked': 'Liked', 'community.unliked': 'Like removed', 'community.postUpdated': 'Post status updated.', 'community.likeA11y': 'Like, {count} likes currently', 'community.unlikeA11y': 'Remove like, {count} likes currently', 'community.signInToLike': 'Sign in to like', 'community.likeCount': 'Like {count}', 'community.likedCount': 'Liked {count}', 'community.commentCount': '{count} comments', 'community.retryLikeA11y': 'Retry like action',
  'community.detailTimeout': 'Loading the post timed out. Check your connection and try again.', 'community.detailLoadFailed': 'Could not load the post', 'community.detailLoadingTitle': 'Loading post', 'community.detailLoadingBody': 'Syncing the latest post and comments…', 'community.detailErrorTitle': 'Post is unavailable', 'community.detailUnavailable': 'The post may have been removed or is temporarily unavailable.', 'community.viewProfileA11y': 'View {name} profile', 'community.report': 'Report', 'community.reportPost': 'Report post', 'community.reportReason': 'Report reason', 'community.reportPlaceholder': 'Briefly explain the reason for your report', 'community.submitReport': 'Submit report', 'community.retryAction': 'Retry action', 'community.syncing': 'Syncing the post and comments…', 'community.refreshFailedTitle': 'Refresh failed; current content is preserved', 'community.refreshAgain': 'Refresh again',
  'community.commentSubmitTimeout': 'Submitting the comment timed out. Try again.', 'community.commentSubmitted': 'Comment submitted', 'community.commentPublished': 'Comment published', 'community.commentPendingBody': 'Your comment is waiting for review.', 'community.commentPublishedBody': 'Your comment is now visible on the post.', 'community.commentSubmitFailed': 'Could not submit comment', 'community.commentFailed': 'Comment failed', 'community.reportTimeout': 'Submitting the report timed out. Try again.', 'community.reportSubmitted': 'Report submitted', 'community.reportReviewBody': 'An administrator will review it.', 'community.reportFailed': 'Could not submit report', 'community.reportFailure': 'Report failed',
  'community.unpublishPost': 'Remove post', 'community.unpublishPostConfirm': 'This post will no longer be public. Continue?', 'community.cancel': 'Cancel', 'community.confirmUnpublish': 'Remove', 'community.unpublishPostTimeout': 'Removing the post timed out. Try again.', 'community.unpublishPostFailed': 'Could not remove post', 'community.unpublishFailed': 'Removal failed', 'community.unpublishComment': 'Remove comment', 'community.unpublishCommentConfirm': 'This comment will no longer be public. Existing replies will remain. Continue?', 'community.unpublishCommentTimeout': 'Removing the comment timed out. Try again.', 'community.commentUnpublished': 'Comment removed', 'community.commentUnpublishedBody': 'This comment was removed from the public list.', 'community.unpublishCommentFailed': 'Could not remove comment',
  'community.targetLocated': 'Jumped to the comment from your notification', 'community.earlierThreadsA11y': 'View {count} earlier comment threads', 'community.earlierThreads': 'View earlier comments ({count} threads remaining)', 'community.replyTo': 'Replying to {name}', 'community.commentReviewing': 'In review · visible only to you', 'community.likeCommentA11y': 'Like comment, {count} likes currently', 'community.unlikeCommentA11y': 'Remove comment like, {count} likes currently', 'community.reply': 'Reply', 'community.replyA11y': 'Reply to {name}', 'community.reportComment': 'Report this comment', 'community.unpublishOwnComment': 'Remove your comment', 'community.unpublishing': 'Removing…', 'community.unpublish': 'Remove', 'community.commentLikeTimeout': 'Updating the comment like timed out. Try again.', 'community.commentLikeFailed': 'Could not update comment like', 'community.retryCommentLike': 'Retry comment like',
  'community.commentReportTimeout': 'Reporting the comment timed out. Try again.', 'community.commentReportReviewBody': 'An administrator will review this comment.', 'community.commentReportFailed': 'Could not report comment', 'community.commentReportReason': 'Comment report reason', 'community.cancelCommentReport': 'Cancel comment report', 'community.retrySubmitCommentReport': 'Retry comment report', 'community.submitCommentReport': 'Submit comment report', 'community.submitting': 'Submitting…', 'community.retryReport': 'Retry report', 'community.noComments': 'No comments yet.', 'community.draftRestored': 'Comment draft restored.', 'community.draftRestoredReply': 'Comment draft restored; replying to {name}.', 'community.replyingTo': 'Replying to {name}', 'community.cancelReply': 'Cancel reply', 'community.commentContent': 'Comment text', 'community.replyPlaceholder': 'Reply to {name}', 'community.commentPlaceholder': 'Write a comment', 'community.draftCounter': '{count}/3000 · Draft saved for 7 days', 'community.publishReply': 'Post reply', 'community.publishComment': 'Post comment', 'community.signInToComment': 'Sign in to comment',
  'profile.heading': 'Me', 'profile.loggedIn': 'Signed in · {account}', 'profile.guest': 'Guest mode · Read all public stories without an account', 'profile.authWarning': 'Production identity service is not configured in this build.', 'profile.login': 'Sign in / Create account',
  'profile.community': 'Immigration Community', 'profile.communityMemberMeta': 'Browse posts, share experiences and ask questions', 'profile.communityGuestMeta': 'Browse without signing in; sign in when you post', 'profile.notifications': 'Notifications', 'profile.unread': ' · {count} unread', 'profile.notificationsMeta': 'Replies, likes, follows and system notices',
  'profile.comments': 'My comments', 'profile.commentsMeta': 'Review comment status and return to the story', 'profile.favorites': 'Saved stories', 'profile.favoritesMeta': 'Safely merge on-device and cloud favorites', 'profile.localFavorites': 'On-device favorites', 'profile.localFavoritesMeta': 'Kept on this device until you sign in',
  'profile.history': 'Reading history', 'profile.historyMeta': 'Merge device and cloud history, up to 100 stories', 'profile.localHistory': 'On-device history', 'profile.localHistoryMeta': 'Kept on this device until you sign in', 'profile.accountSettings': 'Account settings', 'profile.accountSettingsMeta': 'Edit display name, avatar and public bio',
  'profile.signOut': 'Sign out', 'profile.signOutFailed': 'Could not sign out', 'profile.pushDisableFailed': 'Could not disable notifications', 'profile.pushDisableFailedMeta': 'You may still receive notifications after signing out while offline. Disable them in system settings first, or continue signing out.', 'profile.cancel': 'Cancel', 'profile.signOutAnyway': 'Sign out anyway',
  'profile.fontSize': 'Article text size', 'profile.fontSizeMeta': 'Use this text size on every news article', 'profile.fontSmall': 'Small', 'profile.fontStandard': 'Standard', 'profile.fontLarge': 'Large', 'profile.fontExtraLarge': 'Extra large', 'profile.fontPreview': 'Article text preview Aa',
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
