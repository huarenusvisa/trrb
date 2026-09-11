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

生产签名统一由 EAS 远程管理，Android 正式构建明确产出 AAB，首次提交固定进入 Google Play 内部测试轨道并保持草稿，不会直接公开发布。运行 `npm run store:release-preflight` 可检查仓库内的构建和提交安全配置；账号持有人准备好 Expo 权限、Apple 数字 App ID、Apple／Google 远程凭据、三套截图及后台表单后，再运行 `npm run store:release-preflight:strict`。严格预检只显示缺少的资料名称，不读取、保存或输出密钥内容。

iOS 的 `submit.production.ios.ascAppId` 不能使用包名或占位符，必须等账号持有人提供 App Store Connect 中的纯数字 App ID 后再写入。Google Play 服务账号和 Apple App Store Connect API Key 应通过 EAS 凭据管理上传，禁止提交到 Git；本仓库已忽略常见本地凭据文件。预检全部通过后，按平台执行 `eas build --platform ios --profile production`、`eas build --platform android --profile production`，验收包后再执行 `eas submit --platform <ios|android> --profile production`。

`.eas/workflows/store-production-builds.yml` 提供等价的手动双平台构建入口。它没有 `push` 触发器，也不包含自动提交步骤，避免普通代码合并消耗原生构建额度或把未经真机验收的包上传商店。

App Store 中文标题、简介、关键词、隐私政策和账户删除地址维护在 `store.config.json`。iOS Privacy Manifest 的 required-reason API 声明维护在 `app.json`，内容来自当前锁定版本依赖随附的 `PrivacyInfo.xcprivacy`。首次二进制上传并在 App Store Connect 建立版本后，才可使用 `eas metadata:push`；该操作需要 Apple 权限，不属于本地预检。

Apple 与 Google 的支持地址统一使用 `https://trrb.net/app-support.html`。该页面提供中英双语故障排查、公开客服邮箱以及隐私、账户删除和使用条款入口；`config:check` 与 `test:store-support` 会防止商店资料重新指向普通首页或缺失必要支持信息。

Apple App Privacy 与 Google Play Data Safety 的逐项申报草案维护在 `store/data-practices.json`。它把邮箱／手机号账号、个人资料、社区和评论、私信、媒体、收藏／历史及推送令牌映射到两个商店的数据类型，并记录代码证据。运行 `npm run test:store-data` 会核对 App 的追踪设置、第三方 SDK、隐私政策、删除入口和实际功能；提交前仍须由账号持有人在后台确认 Supabase、Netlify、Expo 的生产日志、备份及服务提供商用途。

Apple 审核说明与 Google App Access 可复制文本分别维护在 `store/review/apple-review-notes-en.txt` 和 `store/review/google-app-access-en.txt`，功能入口及代码证据集中在 `store/review-access.json`。审核账号必须提前创建、保持不过期且关闭 OTP／MFA，只能填写在 App Store Connect 和 Google Play Console 的受保护字段，严禁写入仓库、公开发行说明或 CI 日志。`npm run test:store-review` 会校验访客入口、受限功能覆盖、操作路径和常见密钥格式；严格上架预检还要求账号持有人通过 `TRRB_REVIEW_ACCOUNT_CONFIRMED=1` 确认两边后台已保存审核账号。

完整发布顺序维护在 `store/submission-runbook.json`：资料与权限预检 → 双平台 Production 构建 → TestFlight／Google Play 内部测试 → iOS／Android 真机验收 → 人工提交审核。运行 `npm run store:submission-plan` 只会显示当前尚未完成的第一阶段、所需确认项和该阶段的单条安全命令，不读取凭据，也不会执行构建、上传或公开发布。每完成一个阶段后，通过清单列出的 `TRRB_*_CONFIRMED=1` 本地确认变量推进；`npm run test:store-runbook` 会阻止跳过依赖、减少真机测试项、加入自动提交或将 Android 改到公开轨道。

Production 构建完成后，不能只设置两个确认变量。先把 EAS 当前构建详情保存为被 Git 忽略的本地文件，再自动生成正式构建证据：

```bash
eas build:view <IOS_BUILD_ID> --json > store/eas-ios-build.local.json
eas build:view <ANDROID_BUILD_ID> --json > store/eas-android-build.local.json
npm run store:build-evidence-generate
npm run store:build-evidence-check
```

生成器只接受 EAS CLI 当前的 `app`、`updateChannel`、`runtime` 嵌套结构，并自动绑定冻结候选摘要、当前 Expo 项目、Git 提交、App/runtime 版本、Production profile/channel、原生构建号和时间。它只保留白名单元数据，不会把构建下载 URL、日志、操作者或凭据复制到 `store/build-evidence.local.json`；EAS 返回结构变化时会安全失败，需先更新并审核映射。两个输入和输出都只能位于 `apps/mobile/store/` 且以 `.local.json` 结尾，已有输出默认不能覆盖。校验器随后回读候选版本及截图证据，要求两个包来自当前检出的同一冻结候选，且分别为完成状态的 Production IPA 和 AAB。也可参考 `store/build-evidence.template.json` 人工准备，但候选或截图被替换、摘要不一致、产物下载 URL、凭据及任何额外字段都会被拒绝。发布清单只有在 `TRRB_STORE_BUILD_EVIDENCE_FILE=store/build-evidence.local.json` 指向有效文件时才允许进入内部测试阶段。

TestFlight 和 Google Play 内部测试上传完成后，复制 `store/distribution-evidence.template.json` 为被 Git 忽略的 `store/distribution-evidence.local.json`，记录两个商店的处理状态和时间，再运行 `npm run store:distribution-evidence-check`。该校验会回读正式构建证据，要求 TestFlight 与 Google Play 内部轨道引用完全相同的 EAS build ID、Git 提交、App 版本及原生构建号，并强制 Android 保持 `draft`；下载地址、公开轨道、未处理完成状态或凭据字段都会被拒绝。只有再设置 `TRRB_STORE_DISTRIBUTION_EVIDENCE_FILE=store/distribution-evidence.local.json`，发布清单才会进入真机验收阶段。

双平台真机验收后，复制 `store/device-acceptance.template.json` 为被 Git 忽略的 `store/device-acceptance.local.json`。每个平台都必须在实体设备上对同一批内测构建完成清单中的七项验收，并确认所有明确标记的测试帖子和评论已清理；账号删除项只检查入口和最终警告，不删除长期审核账号。运行 `npm run store:device-acceptance-check` 会逐级回读内测与正式构建证据，核对 Git 提交、App 版本、EAS build ID、原生构建号、内测目的地及时间顺序。模拟器、漏测/失败项、未清理测试内容、下载地址或凭据字段都会被拒绝。只有设置 `TRRB_STORE_DEVICE_ACCEPTANCE_FILE=store/device-acceptance.local.json` 后，发布清单才允许进入人工商店审核提交阶段。

在 App Store Connect 和 Google Play Console 人工提交审核后，复制 `store/review-submission.template.json` 为被 Git 忽略的 `store/review-submission.local.json`，再运行 `npm run store:review-submission-check`。该校验逐级回读真机验收、内测和正式构建记录，确保两个后台送审的仍是同一 Git 提交、App 版本、EAS build ID 和原生构建号；送审时间必须晚于真机验收完成时间。两个平台都必须保持自动公开发布关闭，避免审核通过后未经人工确认直接上线。审核账号、商店 API key、提交链接及其他凭据不得写入证据文件。

商店与启动器统一使用 `assets/app-icon-1024.png`。该文件必须保持 1024×1024、sRGB/RGB 且不含 Alpha 或透明色块；`config:check` 会阻止不合规图标进入正式构建。

Google Play 中文标题、短描述和完整描述维护在 `store/google-play/zh-CN/`，分类、联系方式、隐私地址和截图清单维护在 `store/google-play/listing.json`。文案长度遵循 Google Play 的 30/80/4000 字符限制。

连接已安装正式包的 Android 模拟器或测试机后，可以从 `apps/mobile` 目录生成一套不带设备外框的手机截图：

```bash
maestro test .maestro/store-screenshots.yml
```

流程依次截取首页、美国、移民、判例新规和移民社区，并写入 `store/google-play/screenshots/phone/`。截图文件属于上架产物，不提交到 Git；提交前由发布人员在目标机型上确认尺寸、状态栏、实时内容与隐私信息。

App Store 需要分别在 6.9 英寸 iPhone 和 13 英寸 iPad 模拟器上运行对应流程：

```bash
maestro test .maestro/store-screenshots-ios-iphone.yml
maestro test .maestro/store-screenshots-ios-ipad.yml
```

三套截图生成后，运行 `npm run store:submission-check`。该严格预检会阻止截图缺失、顺序不一致、尺寸不受支持、横屏、透明通道或重复图片进入人工上传阶段；截图规格集中维护在 `store/submission-assets.json`。由于截图本身不提交到 Git，常规 CI 只验证预检器、截图清单和生成流程，严格预检必须在提交商店的工作站执行。

预检通过且所有 App 代码已提交后，运行 `npm run store:screenshot-evidence-generate`。工具会从当前 Git 提交和15张真实 PNG 自动生成被 Git 忽略的 `store/screenshot-evidence.local.json`，无需手工填写摘要；已有证据默认不会被覆盖，确认需要重建时才可追加 `-- --force`。输出路径被限制在 `apps/mobile/store/*.local.json`，文件权限为仅当前用户可读写，内容不包含图片、下载地址或凭据。随后运行 `npm run store:screenshot-evidence-check`，核对简体中文首发语言、iPhone 6.9英寸、iPad 13英寸、Android 手机三套目录、固定页面顺序、尺寸与 SHA-256。旧版本、错语言、错目录、重复或被替换的图片不能通过；发布清单还要求 `TRRB_STORE_SCREENSHOT_EVIDENCE_FILE=store/screenshot-evidence.local.json`，因此仅设置“截图已完成”确认值不能跳过证据闸门。需要人工准备时也可继续参考 `store/screenshot-evidence.template.json`。

截图证据通过后，运行 `npm run store:release-candidate-freeze` 生成被 Git 忽略的 `store/release-candidate.local.json`。该冻结记录把当前完整 Git 提交、App/runtime 版本、Production profile/channel 与截图证据文件的 SHA-256 绑定；已有冻结默认不能覆盖，代码或截图证据发生任何变化后必须显式重建。`npm run store:release-candidate-check` 会完成单命令候选版本核验。发布清单只有在 `TRRB_STORE_RELEASE_CANDIDATE_FILE=store/release-candidate.local.json` 指向有效冻结时才允许进入付费 Production 构建，避免构建尚未冻结或使用旧截图的版本。

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

设备令牌通过验证当前登录凭证的服务端入口写入现有 `push_tokens` 表，并在本机保存带账号归属的平台注册信息。同一 Expo Token 的账号归属在数据库事务中串行抢占，设备重装或异常切换账号后不会同时向新旧账号保持启用。系统在 App 运行中轮换原生 Token 时会立即换取并登记新的 Expo Token，再精确停用这个账号在本设备上的旧 Token；不会批量停用同一账号的其他设备。用户关闭本设备通知后，静默生命周期同步会持续尊重这一选择，直至用户再次主动开启。退出登录时，App 会先将当前设备令牌设为停用；网络异常时仍允许用户明确选择退出。通知点击支持冷启动和运行中跳转，仅接受新闻、社区和消息中心的受控目标，不执行服务端传入的任意网址。

登记请求失败时，App 只保存不含登录凭证的账号隔离待同步状态，并按 15 秒起步、最长 15 分钟的有界退避自动重试；回到前台会继续恢复。登记成功、权限撤销、退出登录或用户关闭本设备推送后，待同步状态与定时器都会清理。

运行 `npm run test:push` 可验证通知目标白名单和“仅用户主动操作才申请权限”的规则。远程推送最终验收需要带 APNs/FCM 凭据的开发构建和真机。

服务端发送后会把 Expo ticket 与现有 `push_tokens` 记录关联到仅服务端可读的回执队列。Netlify 每小时检查至少已发送 15 分钟的回执；遇到 `DeviceNotRegistered` 会停用对应设备令牌，其他凭据、限流或消息错误保留在队列中供诊断，不会误停用户设备。超过 24 小时仍无回执的记录标记为过期。

Expo 发送和回执 API 遇到 HTTP 429 或 5xx 时最多重试两次，并使用带上限的指数退避。永久性 4xx 不重试。回执查询本身幂等，可重试临时网络故障；推送发送若在连接后中断且结果未知，则不会自动重发，以免用户收到重复通知。只有 DNS 或拒绝连接等明确尚未建立连接的故障才会安全重试。
