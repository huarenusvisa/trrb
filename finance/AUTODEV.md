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
- `feature-flags.js`：`brokerage=false`、`liveMarketData=false`、`trading=false`。

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

### 第36–37轮：真实 QA 执行通道复测
- A 版关键运行文件、QA 文件均可由 GitHub 连接器读取。
- Chromium + Python Playwright 可用，但容器无法 DNS 解析 GitHub / RawGitHack，不能直接 HTTP 下载 A 版。
- GitHub 连接器没有直接把目录/文件写入容器的动作，因此尚未完整重建 16-case 到本地执行环境。
- 第37轮再次确认 `/usr/bin/chromium` 与 Python Playwright 正常，DNS 仍返回 `Temporary failure in name resolution`。
- 在无真实回归条件下保持功能冻结，没有继续修改核心状态机、图表或产品交互。

### 第38轮：现有 CI 复用审计
- 重新读取本 checkpoint，并检查仓库现有 `.github/workflows`。
- 未发现可直接复用的 finance / Playwright / `qa-suite.html` 浏览器验收 workflow。
- 为遵守保护边界，本轮不新增、不修改任何生产 workflow，也不通过 CI 绕过既定隔离规则。
- 真实 16-case 的唯一剩余执行阻塞仍是“GitHub 连接器源码无法直接落盘到本地 Chromium 可访问目录”；这是执行通道问题，不是已确认的产品缺陷。
- 本轮没有新增产品代码，没有虚报 16-case、iPhone / Safari、桌面或 Lighthouse PASS。

### 第39轮：执行通道与保护边界复核
- 再次确认 A 版 `qa-suite.html` 为 16-case 自动验收入口，且会自动运行首页 / 个股 / ETF 多视口、未知资产、slow-ready、data-missing 与深度交互检查。
- 再次实测容器对 `github.com`、`raw.githubusercontent.com`、`api.github.com` 均返回 `Temporary failure in name resolution`；Chromium 本身不是当前阻塞点。
- `main` 与 `finance-v1-robinhood` 当前为 diverged：财经分支 ahead 193 / behind 118；未执行 merge / rebase。
- compare 结果显示本轮财经差异仍限定在 `finance/` 文件范围，没有触碰 `netlify.toml`、SEO、Sitemap 或生产部署 workflow。
- 在真实 16-case 仍无法执行的前提下，没有发现足够确定、值得冒风险修改的产品缺陷；继续保持功能冻结，不新增产品代码，不虚报 PASS。

### 第40轮：A版入口与静态封板复核
- 重新读取当前权威 checkpoint，并确认 `finance-v1-preview/finance/preview.html` 只是 iframe 包装器，实际仍加载同目录 `index.html#market`，没有独立外部部署入口可绕开源码落盘问题。
- 静态复核 `navigation-memory.js` 与 `app.js` 当前恢复链：page / marketPanel / watchFilter / fundFilter 均通过内部 setter 恢复，setter 自身包含非法值回退，不再发现新的确定性 synthetic-click 或非法筛选恢复缺陷。
- 最新 compare：`main` 与 `finance-v1-robinhood` 仍 diverged，财经分支 ahead 194 / behind 122；差异文件仍全部位于 `finance/`，未触碰保护范围。
- 本轮没有新增产品代码；真实 16-case 仍未执行，因此不标记 iPhone / Safari、桌面或 Lighthouse PASS。

## 当前结论
状态：**V1 Candidate+ / 功能冻结**。

下一步优先级：
1. 继续寻找可把 GitHub 连接器内容落盘到本地容器的安全通道；一旦成功，立即本地 HTTP + Chromium 跑 16-case。
2. 若真 QA 有 FAIL/WARN，只修具体缺陷并同步开发 / A 版。
3. 完成 iPhone / Safari、桌面、Lighthouse。
4. 全部关闭后标记 `V1 Complete`。

完整早期历史保留在 Git 提交历史中，本文件只保留当前可执行 checkpoint。