# 唐人日报 Mobile App

同一套 React Native + Expo + TypeScript 代码同时构建 iOS 与 Android。

## 当前一期结构

- 首页：实时读取唐人日报公开新闻 API，并对核心栏目做独立补充查询，避免低频栏目被全站高频新闻挤出。
- 美国：美国时政 + 美国警情。
- 移民：移民美国 + 庇护百科。
- 判例新规：读取 `data/legal/unified-legal-authorities-latest.json`。
- 我的：收藏、阅读历史、推送设置的后续入口。
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
3. 收藏/阅读历史持久化。
4. Expo Notifications + APNs/FCM 推送。
5. 搜索。
6. 法律详情页中文解析。
7. App Store / Google Play 构建配置与商店素材。

## 正式构建预检

正式构建使用 EAS 的 `production` profile，并在构建时自动递增 iOS build number / Android version code。提交构建前运行：

```bash
npm run typecheck
npm run config:check
npm run export:web
```

`config:check` 会验证 App 标识、版本号、EAS 项目、更新通道、商店图标尺寸和正式构建自动递增设置，不读取或输出任何签名凭据。

App Store 中文标题、简介、关键词、隐私政策和账户删除地址维护在 `store.config.json`。iOS Privacy Manifest 的 required-reason API 声明维护在 `app.json`，内容来自当前锁定版本依赖随附的 `PrivacyInfo.xcprivacy`。首次二进制上传并在 App Store Connect 建立版本后，才可使用 `eas metadata:push`；该操作需要 Apple 权限，不属于本地预检。
