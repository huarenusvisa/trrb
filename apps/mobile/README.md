# 唐人日报 Mobile App

同一套 React Native + Expo + TypeScript 代码同时构建 iOS 与 Android。

## 当前一期结构

- 首页：实时读取唐人日报公开新闻 API，并对核心栏目做独立补充查询，避免低频栏目被全站高频新闻挤出。
- 美国：美国时政 + 美国警情。
- 移民：移民美国 + 庇护百科。
- 判例新规：读取 `data/legal/unified-legal-authorities-latest.json`。
- 我的：收藏、阅读历史、账号与推送设置。
- 新闻详情：一期先从公开新闻流读取；二期改为专用 article-by-id API。

## 单一数据原则

App 不复制网站静态新闻文件，不读取 `articles-chunk-*`。新闻事实源通过 TRRB 的公开 API 读取；栏目顺序以服务端 `published_at DESC, created_at DESC` 为准。

## 本地启动

需要 Node.js 22.13+。

```bash
cd apps/mobile
npm install
npm run start
```

随后可启动 iOS 或 Android 开发环境：

```bash
npm run ios
npm run android
```

## 下一阶段

1. 专用移动端 `/article-by-id` API。
2. 图片缓存与骨架屏。
3. 推送回执与失效设备令牌自动清理。
4. 搜索。
5. 法律详情页中文解析。

## 正式构建预检

正式构建使用 EAS 的 `production` profile，并在构建时自动递增 iOS build number / Android version code。提交构建前运行：

```bash
npm run typecheck
npm run config:check
npm run export:web
```

`config:check` 会验证 App 标识、版本号、EAS 项目、更新通道、商店图标尺寸和正式构建自动递增设置，不读取或输出任何签名凭据。

App Store 中文标题、简介、关键词、隐私政策和账户删除地址维护在 `store.config.json`。iOS Privacy Manifest 的 required-reason API 声明维护在 `app.json`，内容来自当前锁定版本依赖随附的 `PrivacyInfo.xcprivacy`。首次二进制上传并在 App Store Connect 建立版本后，才可使用 `eas metadata:push`；该操作需要 Apple 权限，不属于本地预检。

商店与启动器统一使用 `assets/app-icon-1024.png`。该文件必须保持 1024×1024、sRGB/RGB 且不含 Alpha 或透明色块；`config:check` 会阻止不合规图标进入正式构建。

Google Play 中文标题、短描述和完整描述维护在 `store/google-play/zh-CN/`，分类、联系方式、隐私地址和截图清单维护在 `store/google-play/listing.json`。文案长度遵循 Google Play 的 30/80/4000 字符限制。

连接已安装正式包的 Android 模拟器或测试机后，可以从 `apps/mobile` 目录生成一套不带设备外框的手机截图：

```bash
maestro test .maestro/store-screenshots.yml
```

流程依次截取首页、美国、移民、判例新规和移民社区，并写入 `store/google-play/screenshots/phone/`。截图文件属于上架产物，不提交到 Git；提交前由发布人员在目标机型上确认尺寸、状态栏、实时内容与隐私信息。

## 统一账号真机回归

`.eas/workflows/auth-e2e.yml` 会复用最近一次 `e2e-test` 的 Android 和 iOS 模拟器构建，先验证“打开登录页 → 登录或自动注册 → 保存 Supabase 会话 → 个人页显示账号 → 退出登录”，再在两个平台分别完成社区发帖闭环和新闻评论闭环。

运行前须在 EAS `preview` 环境配置 `MAESTRO_TEST_ACCOUNT_IDENTIFIER`、`MAESTRO_TEST_ACCOUNT_PASSWORD`、`MAESTRO_TEST_CONTENT_SUFFIX`、`EXPO_PUBLIC_SUPABASE_URL` 和 `EXPO_PUBLIC_SUPABASE_ANON_KEY`。测试邮箱必须以 `trrb-e2e-` 开头；内容后缀必须是 6–32 位小写字母、数字或连字符，用来区分每次运行。凭据不得写入仓库，预检失败时也不会输出其值。配置完成后，从 EAS Workflows 手动运行 `Unified account, community and comments E2E`。

社区流程只创建标题以 `【TRRB-E2E-` 开头且正文含固定自动化标记的测试帖。正常路径由作者立即下架；无论 Maestro 成功还是失败，独立清理任务都会使用同一测试用户的短期会话再次查找双重标记内容并调用现有 `community-api` 下架。清理脚本不含 service-role，也不能下架其他用户或仅命中单一标记的内容。

新闻评论流程会在一篇公开新闻下发布带本轮后缀的评论与回复，并验证点赞、举报和作者删除。正常路径会软删除两条测试内容；失败兜底只查询当前测试账号、当前后缀且仍为公开或待审的评论，再调用现有 `delete_own_comment` RPC。客户端与清理任务都不能删除其他用户评论。

## 社区帖子闭环

社区列表中的帖子可进入 App 原生详情页。详情页继续复用网站现有 `community-api`，支持读取评论、发表评论、点赞或取消点赞、举报，以及作者下架自己的帖子。所有写操作携带当前 Supabase 会话的短期 access token；App 不包含 service-role 或其他服务端密钥。

运行 `npm run test:community` 可验证帖子详情读取、会话头、评论、点赞、举报、作者下架以及输入校验的客户端契约。

运行 `npm run test:comments` 可验证新闻评论作者权限、回复结构以及失败兜底清理的双重所有权和运行标记约束。

## 推送通知

App 不会在首次启动时直接请求系统通知权限。已登录用户可以从“我的 → 推送设置”主动开启本设备通知，并分别选择重大新闻、ICE、移民、判例新规和社区互动。Android 会先创建新闻通知频道，再申请权限；已授权设备在登录后会静默同步 Expo Push Token，不重复弹窗。

设备令牌只以当前用户身份写入现有 `push_tokens` 表。用户关闭本设备通知或退出登录时，App 会先将当前设备令牌设为停用；网络异常时仍允许用户明确选择退出。通知点击支持冷启动和运行中跳转，仅接受新闻、社区和消息中心的受控目标，不执行服务端传入的任意网址。

运行 `npm run test:push` 可验证通知目标白名单和“仅用户主动操作才申请权限”的规则。远程推送最终验收需要带 APNs/FCM 凭据的开发构建和真机。

服务端发送后会把 Expo ticket 与现有 `push_tokens` 记录关联到仅服务端可读的回执队列。Netlify 每小时检查至少已发送 15 分钟的回执；遇到 `DeviceNotRegistered` 会停用对应设备令牌，其他凭据、限流或消息错误保留在队列中供诊断，不会误停用户设备。超过 24 小时仍无回执的记录标记为过期。

Expo 发送和回执 API 遇到 HTTP 429 或 5xx 时最多重试两次，并使用带上限的指数退避。永久性 4xx 不重试。回执查询本身幂等，可重试临时网络故障；推送发送若在连接后中断且结果未知，则不会自动重发，以免用户收到重复通知。只有 DNS 或拒绝连接等明确尚未建立连接的故障才会安全重试。
