# 唐人日报 Mobile App

同一套 React Native + Expo + TypeScript 代码同时构建 iOS 与 Android。

## 当前功能

- 首页：实时读取唐人日报公开新闻 API，并对核心栏目做独立补充查询，避免低频栏目被全站高频新闻挤出。
- 美国：美国时政 + 美国警情。
- 移民：七大移民知识中心；提供 AsylumJudge 专业法官查询入口，优先打开独立 App，未安装时回退至 `https://asylumjudge.com/`。
- 判例新规：读取 `data/legal/unified-legal-authorities-latest.json`。
- 我的：账号、收藏、阅读历史、评论、通知及推送设置。
- 新闻详情：读取文章详情及相关新闻，支持收藏、评论和作者关注。
- 搜索：支持站内新闻搜索、搜索历史和热门搜索。
- 发布配置：已配置独立的 iOS/Android 包名、EAS Update、设备构建与 Maestro 回归流程。

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

## 发布前剩余工作

1. 完成 App Store / Google Play 商店素材、隐私表单及最终签名配置。
2. 在真实 iOS/Android 设备上验证通知权限、深链回退和账号删除闭环。
3. 完成发布候选构建的 Maestro 全量回归与弱网测试。

## 边界

新闻采集、翻译、字数、查重、审核和自动发布规则属于服务端工作流，移动端只读取已发布内容，不在客户端复制或改写这些规则。
