# 唐人财经 V1 当前权威开发状态

## 仓库与保护边界
- Repository: `huarenusvisa/trrb`
- Development: `finance-v1-robinhood`
- Preview: `finance-v1-preview`
- 未经用户明确要求，不 merge / rebase `main`。
- 财经开发仅修改 `finance/`；不得修改 `netlify.toml`、SEO 脚本、SEO 诊断/验收脚本、Sitemap、生产部署 workflow 或与唐人财经无关的生产功能。

## 产品定位与合规
- 产品名：唐人财经；一级导航：自选｜行情｜基金｜我的；默认行情。
- 新闻是行情/自选/基金/个股的解释层，不是一级频道。
- V1 不开放开户、Trade/下单、KYC、基金购买/申购、券商账户连接。
- 当前行情、历史区间、K线、评级等明确标识 demo/fallback；未知股票/ETF 不用 AAPL/SPY 冒充。
- `feature-flags.js` 当前 `brokerage=false`、`liveMarketData=false`、`trading=false`。

## 已完成核心能力
### 首页 / 行情 / 自选
- 三大指数、微型走势、市场状态、热力图、Top Movers、Earnings / Upcoming / Macro / Crypto、市场新闻解释层。
- 股票 / ETF / 基金搜索，键盘上下 / Enter / Escape / ARIA。
- Hash 路由与浏览器前进 / 后退。
- 股票 + ETF 统一自选；全部 / 美股 / 中概 / ETF / 港股 / 沪深筛选。
- 列表 / 热力视图、管理、移除、精确撤销；最新价 / 涨跌幅排序与本机偏好。
- `FinanceAppState.refreshWatch()` 直接重绘，storage / finance:resume 不再模拟当前筛选点击。

### ETF / 基金
- ETF 主题筛选、参数化 ETF 详情、费率/规模/风险/持仓/资讯、走势图读数。
- ETF 关注按钮在 storage / finance:resume / BFCache 后重新读取真实状态。
- 不加载股票专属 K 线增强层。

### 个股详情
- 当前价、涨跌、盘后、高低价、成交量。
- 1D / 1W / 1M / 3M / YTD / 1Y / 5Y。
- 走势 / K线、日K / 周K / 月K、OHLC + 成交量；K线最小区间约束。
- 鼠标 / 触摸 / 键盘图表读取；sticky 迷你报价。
- 关键数据、新闻、评级、财务、EPS、SEC 接口位、热度、公司概览。
- 自选 / 提醒 / 分享；按钮在 storage / finance:resume / BFCache 后重新读取真实状态。

### 导航 / 恢复 / 韧性
- 详情 sticky 分区导航与来源自适应返回。
- Safari / BFCache / visualViewport / iPhone 键盘处理。
- `FinanceNavigationMemory.isRestoring()`、`FinanceDetailStateSync.snapshot()`、`FinanceAppState.snapshot()`、`FinanceResilienceHealth.snapshot()`。
- `FinanceAppState.setPage / setMarketPanel / setWatchFilter / setFundFilter` 已作为内部 setter。
- `navigation-memory.js` 恢复路径直接调用 setter，不再 synthetic click 恢复一级页、行情 Tab、自选筛选或 ETF 主题。
- 弱网 / 离线 / 加载失败恢复条；offline / data-missing / slow 原因分离。

### 视觉 / 无障碍
- 360–430px 静态防溢出，900 / 1180 / 1440+ 桌面布局。
- iPhone safe-area、详情 sticky offset、reduced-motion、高对比、focus-visible。
- 关键移动触控目标 40–44px；图表 role / aria-label 随模式和周期更新。

## QA 基础设施
- `acceptance-check.js`：仅 `qa=1` 加载。
- `qa-interactions.js`：真实操作搜索、导航、自选排序、精确撤销、ETF筛选、K线、YTD、键盘图表读取。
- `qa-detail-state.js`：验证首页 / 个股 / ETF 的 storage、finance:resume、BFCache 状态恢复。
- BFCache 回归要求 page / marketPanel / watchFilter / fundFilter 全部恢复，且四类导航控件 synthetic click 次数必须为 0。
- `qa-suite.html`：16 case = 首页 / AAPL / QQQ × 360 / 390 / 430 / 1280 + 未知股票 + 未知 ETF + slow-ready + data-missing。
- 每 case 使用独立 `trfinance.*` localStorage/sessionStorage 沙盒，结束后恢复原状态。
- 深度交互捕获 `error` / `unhandledrejection`；未知资产不得替代行情；slow-ready / data-missing 有确定性故障注入。

## 尚未关闭的上线验收
- [ ] 真实浏览器运行 A 版 `qa-suite.html`，清零实际 FAIL，人工判断 WARN。
- [ ] 360–430px 实际 iPhone / Safari 人工视觉验收。
- [ ] 桌面实际浏览器人工视觉验收。
- [ ] Lighthouse Performance / Accessibility / Best Practices。
- [ ] V1 最终自测与 `V1 Complete`。

## 当前外部依赖
- 实时证券行情、实时新闻、财报 / 评级 / SEC：待合法授权或合规数据源。
- 交易 / 基金销售：待牌照、合作方、KYC、隐私与协议完成后再评估。

## 最近关键封板记录
### 第31–35轮
- 第31轮：详情按钮 storage / finance:resume / BFCache 状态同步。
- 第32轮：首页直接刷新接口，移除自选刷新 synthetic click。
- 第33轮：确认自动执行环境具备 Chromium + Python Playwright；容器外网 DNS 失败。
- 第34轮：`FinanceAppState` setter 化，移除 navigation-memory 恢复路径 synthetic click。
- 第35轮：增加 BFCache 四类状态回归和 synthetic click=0 断言；确认 GitHub 连接器可以枚举 A 版 `finance/` 目录。

### 第36轮：本地 QA 传输通道实测与 A 版一致性复核
- 已重新读取权威 checkpoint 并枚举 `finance-v1-preview/finance/` 全目录；A 版关键运行文件、QA 文件均可由 GitHub 连接器读取。
- 容器当前确有 Chromium + Python Playwright，但容器仍无法 DNS 解析 `github.com` / `raw.githubusercontent.com` / RawGitHack，因此不能直接通过 HTTP 下载 A 版。
- GitHub 连接器当前没有“把目录/文件直接写入容器文件系统”的动作；连接器返回的是内容资源，无法被本地 Chromium 直接挂载。因此本轮未能完整重建 16-case 到本地执行环境。
- 已核验 A 版 `feature-flags.js`：`brokerage=false`、`liveMarketData=false`、`trading=false`，未发生交易能力误开放。
- 开发分支相对最新 `main` 当前为 `ahead 190 / behind 94`；未 merge/rebase，当前 compare 差异仍集中在 `finance/`。
- 未虚报 16-case、iPhone / Safari、桌面或 Lighthouse PASS。

## 当前结论
状态：**V1 Candidate+ / 功能冻结**。

下一步优先级：
1. 继续寻找可把 GitHub 连接器内容落盘到本地容器的安全通道；一旦成功，立即本地 HTTP + Chromium 跑 16-case。
2. 若真 QA 有 FAIL/WARN，只修具体缺陷并同步开发 / A 版。
3. 完成 iPhone / Safari、桌面、Lighthouse。
4. 全部关闭后标记 `V1 Complete`。

完整早期历史保留在 Git 提交历史中，本文件只保留当前可执行 checkpoint。