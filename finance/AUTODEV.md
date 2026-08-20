# 唐人财经 V1 当前权威开发状态

## 仓库与分支
- Repository: `huarenusvisa/trrb`
- Development branch: `finance-v1-robinhood`
- Preview branch: `finance-v1-preview`
- 未经用户明确要求，不 merge / rebase `main`。

## 保护区
财经开发默认仅修改 `finance/`，不得修改：
- `netlify.toml`
- SEO 脚本、SEO 诊断 / 验收脚本
- sitemap 文件与生成逻辑
- 生产部署 workflow
- 与唐人财经无关的生产功能

## 产品定位与合规边界
- 产品名：唐人财经。
- 一级导航：自选｜行情｜基金｜我的；默认入口为行情。
- 新闻不是一级频道，而是行情、自选、基金、个股的解释层。
- 信息架构参考腾讯自选股；产品气质参考 Robinhood；代码、资产、交互独立实现。
- 白底 + 绿色主色 / 上涨 + 红色下跌 / 风险。
- V1 不开放：开户、Trade / 下单、KYC、基金购买 / 申购、券商账户连接。
- 当前行情、历史区间、K线、评级等均明确标识为 demo / fallback；未知股票 / ETF 不用 AAPL / SPY 冒充。
- 真实行情、新闻、财报、评级后续必须使用合法授权或合规数据源。

## 当前完成状态
### 首页 / 行情 / 自选
- [x] 三大指数、微型走势、市场状态、热力图、Top Movers。
- [x] Earnings / Upcoming / Macro / Crypto 与市场新闻解释层。
- [x] 搜索股票 / ETF / 基金、键盘上下 / Enter / Escape / ARIA。
- [x] Hash 路由与浏览器前进 / 后退。
- [x] 股票 + ETF 统一自选；全部 / 美股 / 中概 / ETF / 港股 / 沪深筛选。
- [x] 列表 / 热力视图、管理、移除、精确撤销。
- [x] 最新价 / 涨跌幅升降序与恢复原顺序；排序偏好本机保存。
- [x] `FinanceAppState.refreshWatch()` 直接重绘当前筛选下自选，storage / finance:resume 不再模拟点击筛选按钮。

### ETF / 基金
- [x] ETF 主题研究页与核心指数 / 科技 / 黄金 / 半导体筛选。
- [x] 参数化 ETF 详情：费率、规模、风险、持仓、资讯。
- [x] 走势图区间切换与键盘 / 触摸读数。
- [x] ETF 详情关注按钮在 storage / finance:resume / BFCache 后重新读取真实本机状态。
- [x] 不加载股票专属 K 线增强层。

### 个股详情
- [x] 当前价、涨跌、盘后、高低价、成交量。
- [x] 1D / 1W / 1M / 3M / YTD / 1Y / 5Y 与所选周期收益联动。
- [x] 走势 / K线，日K / 周K / 月K，OHLC + 成交量。
- [x] K线约束：日K≥1M、周K≥3M、月K≥1Y。
- [x] 鼠标 / 触摸 / 键盘图表读取。
- [x] sticky 顶部迷你报价与当前周期 / 图表读数一致。
- [x] 关键数据、新闻、评级、财务、EPS、SEC接口位、热度、公司概览。
- [x] 加入自选、提醒、分享。
- [x] 自选 / 提醒按钮在 storage / finance:resume / BFCache 后重新读取真实本机状态。

### 导航 / 恢复 / 韧性
- [x] 详情 sticky 分区导航与当前阅读分区高亮。
- [x] 来源自适应返回，session 级筛选与滚动恢复。
- [x] Safari / BFCache 页面恢复与 visualViewport / iPhone 键盘处理。
- [x] `FinanceNavigationMemory.isRestoring()` 提供只读恢复状态，恢复期间 live-region 静默。
- [x] `FinanceDetailStateSync.snapshot()` 提供详情按钮同步原因 / 次数只读状态。
- [x] `FinanceAppState.snapshot()` 提供首页当前页、行情 Tab、自选筛选、ETF 主题、管理态与刷新次数只读状态。
- [x] `FinanceAppState` 已提供 `setPage / setMarketPanel / setWatchFilter / setFundFilter` 内部 setter。
- [x] `navigation-memory.js` 的 BFCache / session 来源恢复已改为直接调用上述 setter，不再通过 synthetic click 恢复底部一级页、行情 Tab、自选筛选或 ETF 主题。
- [x] 弱网 / 离线 / 加载失败恢复条与空状态操作入口。
- [x] readiness observer 完成后断开，多恢复事件合并，sessionStorage 滚动写入节流。
- [x] `FinanceResilienceHealth.snapshot()` 暴露 ready / busy / recovery / online / dataAvailable 状态。
- [x] 恢复条文案按真实原因区分 offline / data-missing / slow。

### 视觉 / 响应式 / 无障碍
- [x] A 版设计系统与 360–430px 静态防溢出。
- [x] 900 / 1180 / 1440+ 桌面布局。
- [x] content-visibility、focus-visible、reduced-motion、高对比基础支持。
- [x] 行情数字 tabular numerals。
- [x] 手机关键触控目标 ≥40px，返回 / 分享等主要目标 ≥44px。
- [x] iPhone safe-area 与详情 sticky offset 已处理。
- [x] 股票 / ETF 图表 role / aria-label 随模式和周期同步。

## QA / 验收基础设施
- [x] `acceptance-check.js`：仅 `qa=1` 时加载。
- [x] `qa-interactions.js`：真实操作搜索、导航、自选排序、精确撤销、ETF筛选、K线、YTD、键盘图表读取。
- [x] `qa-detail-state.js`：验证首页 / 个股 / ETF 的直接刷新、storage 与 finance:resume 状态同步。
- [x] `qa-detail-state.js` 新增 BFCache 四类状态恢复回归：page / marketPanel / watchFilter / fundFilter 必须通过内部 setter 恢复，且 `.market-tab/.watch-filter/.fund-cat/.bottom button` synthetic click 次数必须为 0。
- [x] `qa-suite.html`：12 个常规多视口 case + 4 个异常路径 case，共 16 个 case。
- [x] 常规视口：首页 / AAPL / QQQ × 360 / 390 / 430 / 1280px。
- [x] 异常 case：未知股票 ZZZZ、未知 ETF FAKE、slow-ready、data-missing。
- [x] 每个 case 使用独立 `trfinance.*` localStorage / sessionStorage 沙盒并在结束后恢复用户原状态。
- [x] 深度交互捕获 `error` / `unhandledrejection`。
- [x] 首页精确撤销压力测试与 BFCache 来源恢复测试已具备。
- [x] 未知资产不回退到 AAPL / SPY；slow-ready / data-missing 具备确定性故障注入。

## 尚未关闭的验收项
- [ ] 在真实浏览器运行 A 版 `qa-suite.html`，清零实际 FAIL，并人工判断剩余 WARN。
- [ ] 360–430px 实际 iPhone / Safari 人工视觉验收。
- [ ] 桌面实际浏览器人工视觉验收。
- [ ] Lighthouse Performance / Accessibility / Best Practices 最终检查。
- [ ] V1 最终自测与 `V1 Complete` 标记。

## 外部依赖
- 实时证券行情 API：待合法数据源 / 授权。
- 实时新闻数据源：待合法数据源 / 授权。
- 财报 / 评级 / SEC 等真实数据：待合法数据源确定。
- 交易 / 基金销售：待牌照、合作方、KYC、隐私与协议完成后再评估。

## 最近关键开发记录
### 第三十一轮：详情控制状态恢复与跨标签一致性
- 新增 `detail-state-sync.js`，个股详情同步自选 / 提醒，ETF 详情同步基金关注。
- 同步层只更新按钮文本和 `aria-pressed`，不弹 Toast、不修改行情或图表。
- `qa-detail-state.js` 增加 storage / finance:resume 状态同步测试。

### 第三十二轮：首页直接刷新接口与合成点击清理
- 新增 `FinanceAppState.refreshWatch / refreshFunds / refreshProfile` 与状态快照。
- 自选 BFCache / storage / finance:resume 刷新不再模拟当前筛选点击。
- QA 捕获 `.watch-filter` click，直接刷新出现合成点击即 FAIL。

### 第三十三轮：本地真实 QA 执行通道诊断
- 自动执行环境确认具备 Chromium 与 Python Playwright。
- 当前容器没有仓库 checkout；`github.com`、`raw.githubusercontent.com`、`raw.githack.com`、`api.github.com` DNS 解析失败，Chromium / curl 无法取得 A 版源码。
- 连接的 GitHub 通道可读取仓库，但无法直接把完整目录挂载进本地 Chromium 执行环境。
- 未虚报 16-case、iPhone / Safari、桌面或 Lighthouse PASS。

### 第三十四轮：恢复状态 setter 化
- `FinanceAppState` 新增 `setPage / setMarketPanel / setWatchFilter / setFundFilter`；用户点击仍复用同一内部状态函数，未改变产品交互语义。
- `navigation-memory.js` 移除恢复路径上的 `clickIfNeeded()` 和底部导航 synthetic click，BFCache / session 恢复直接调用 `FinanceAppState` setter。
- 页面恢复仍使用 `__financeRestoringNavigation` 静默区，因此内部 setter 不产生用户主动操作播报。
- 开发分支与 A 版预览已同步 `app.js` 与 `navigation-memory.js` 的对应逻辑。
- 本轮仍未完成真实 16-case、iPhone / Safari、桌面或 Lighthouse 验收，不标记 PASS。

### 第三十五轮：恢复链回归保护与本地执行通道推进
- GitHub 连接器已确认可以列出 `finance-v1-preview` 的 `finance/` 目录，因此“逐文件重建 A 版到本地临时目录”是可行路径；不再把“无法挂载整目录”视为绝对阻塞。
- `qa-detail-state.js` 新增独立 BFCache 回归：临时写入 navState / navContext，触发 persisted pageshow，要求 page / marketPanel / watchFilter / fundFilter 四类状态完整恢复。
- 同一回归监听四类导航控件，恢复期间任何 synthetic click 都直接 FAIL；测试结束恢复 sessionStorage 与原页面状态。
- QA 文件已同步到 `finance-v1-robinhood` 与 `finance-v1-preview`，内容 SHA 一致。
- 本轮仍未完成 16-case 真浏览器执行，因此不标记实际 PASS；下一步优先继续通过 GitHub 目录枚举逐文件重建 A 版，再用本地 HTTP + Chromium 运行现有 QA。

## 当前结论
当前状态：**V1 Candidate+ / 功能冻结**。

后续只做：
1. 通过 GitHub 目录枚举将 A 版必要源码逐文件重建到本地并运行 16-case；
2. 清理实际 FAIL / WARN；
3. iPhone / Safari 与桌面人工视觉验收；
4. Lighthouse 最终检查；
5. 只修验收发现的具体问题；
6. 全部关闭后再标记 `V1 Complete`。

完整早期轮次历史保留在 Git 提交历史中，本文件作为当前权威 checkpoint 使用。