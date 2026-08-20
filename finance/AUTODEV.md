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

## 产品定位
- 产品名：唐人财经
- 一级导航：自选｜行情｜基金｜我的
- 默认入口：行情
- 新闻不是一级频道，而是行情、自选、基金、个股的解释层。
- 信息架构参考腾讯自选股；产品气质参考 Robinhood；代码、资产、交互独立实现。
- 白底 + 绿色主色 / 上涨 + 红色下跌 / 风险。
- 当前公开定位：财经新闻 · 自选行情 · ETF基金 · 投资研究。

## 合规边界
V1 不开放：开户、Trade / 下单、KYC、基金购买 / 申购、券商账户连接。

当前数据为明确标识的 demo / fallback：
- 未知股票 / ETF 返回未找到，不用 AAPL / SPY 冒充。
- 历史区间与 K 线明确标记演示。
- 不硬编码 secrets。
- 真实行情、新闻、财报、评级后续必须使用合法授权或合规数据源。

## 当前完成状态
### 首页与行情
- [x] 三大指数、微型走势、市场状态、热力图、Top Movers
- [x] Earnings / Upcoming / Macro / Crypto
- [x] 市场新闻解释层
- [x] 搜索股票 / ETF / 基金与最近浏览 / 热门搜索
- [x] 搜索键盘上下、Enter、Escape、ARIA 状态
- [x] Hash 路由与浏览器前进 / 后退

### 自选
- [x] 股票 + ETF 统一自选
- [x] 全部 / 美股 / 中概 / ETF / 港股 / 沪深筛选
- [x] 列表 / 热力视图、管理、移除、撤销
- [x] 自选删除使用删除前股票 + ETF 快照，撤销精确恢复，不再依赖二次 toggle
- [x] 最新价 / 涨跌幅升降序与恢复原顺序
- [x] 排序偏好本机保存；BFCache 返回后重新读取并应用
- [x] `FinanceAppState.refreshWatch()` 直接重绘当前筛选下的自选；storage / finance:resume 不再通过模拟点击筛选按钮刷新

### ETF / 基金
- [x] ETF 主题研究页与核心指数 / 科技 / 黄金 / 半导体真实筛选
- [x] 参数化 ETF 详情：费率、规模、风险、持仓、资讯
- [x] 走势图区间切换与键盘 / 触摸读数
- [x] ETF 详情关注按钮在 storage / finance:resume / BFCache 后重新读取真实本机状态
- [x] 不加载股票专属 K 线增强层

### 个股详情
- [x] 当前价、涨跌、盘后、高低价、成交量
- [x] 1D / 1W / 1M / 3M / YTD / 1Y / 5Y 与所选周期收益联动
- [x] 走势 / K线，日K / 周K / 月K，OHLC + 成交量
- [x] K线约束：日K≥1M、周K≥3M、月K≥1Y
- [x] 鼠标 / 触摸 / 键盘图表读取
- [x] sticky 顶部迷你报价与当前周期 / 图表读数一致
- [x] 关键数据、新闻、评级、财务、EPS、SEC接口位、热度、公司概览
- [x] 加入自选、提醒、分享
- [x] 自选 / 提醒按钮在 storage / finance:resume / BFCache 后重新读取真实本机状态

### 导航 / 恢复 / 韧性
- [x] 详情 sticky 分区导航与当前阅读分区高亮
- [x] 来源自适应返回，session 级筛选与滚动恢复
- [x] Safari / BFCache 页面恢复与 visualViewport / iPhone 键盘处理
- [x] BFCache / session 恢复使用临时恢复标记，合成点击不再触发“用户主动切换”live-region 播报
- [x] `FinanceNavigationMemory.isRestoring()` 提供只读恢复状态，供 QA 验证恢复静默性
- [x] `FinanceDetailStateSync.snapshot()` 提供详情按钮同步原因 / 次数只读状态，区分 init / storage / finance:resume / pageshow
- [x] `FinanceAppState.snapshot()` 提供首页当前页、筛选、管理态与直接刷新次数 / 原因只读状态
- [x] 弱网 / 离线 / 加载失败恢复条与空状态操作入口
- [x] readiness observer 完成后断开，多恢复事件合并，sessionStorage 滚动写入节流
- [x] 个股 / ETF 顶部栏 iPhone safe-area-inset-top
- [x] 详情 sticky 分区 top、scroll-margin 与真实 observer offset 同步
- [x] `FinanceResilienceHealth.snapshot()` 暴露只读 ready / busy / recovery / online / dataAvailable 状态
- [x] `finance:resume` / 网络恢复时韧性层主动重新对账 DOM 与内部完成态
- [x] 恢复条文案按真实原因区分：offline / data-missing / slow，不把普通加载问题误写成“网络已恢复”

### 视觉 / 响应式 / 无障碍
- [x] A 版设计系统与 360–430px 静态防溢出
- [x] 900 / 1180 / 1440+ 桌面布局
- [x] content-visibility、focus-visible、reduced-motion、高对比基础支持
- [x] 行情数字 tabular numerals
- [x] 详情分区 / 图表区间 / 自选排序 / K线模式手机触控高度 ≥40px
- [x] 返回箭头 / 分享按钮命中区 ≥44×44px
- [x] 自选管理、删除、Toast 撤销手机命中区 ≥40px
- [x] 偏好 Toggle 使用 56×40 按钮命中区
- [x] 短文字按钮最小宽度 44px，提醒行链接最小高度 44px
- [x] 未找到页面返回入口最小高度 44px
- [x] 恢复条按钮手机最小高度 40px；coarse pointer ≥44px
- [x] 个股 / ETF 顶部左右操作槽统一 64px，迷你报价几何居中
- [x] 股票 / ETF 图表使用 `role="group"`，aria-label 随走势 / K线 / 周期实时同步

## QA / 验收基础设施
- [x] `acceptance-check.js`：仅 `qa=1` 时加载
- [x] `qa-interactions.js`：真实操作搜索、导航、自选排序、精确撤销、ETF筛选、K线、YTD、键盘图表读取
- [x] `qa-detail-state.js`：仅 QA Suite 加载，包装首页 / 个股 / ETF case 验证直接刷新、storage 与 finance:resume 状态同步
- [x] `qa-suite.html`：12 个常规多视口 case + 4 个异常路径 case，共 16 个 case
- [x] 常规视口：首页 / AAPL / QQQ × 360 / 390 / 430 / 1280px
- [x] 异常 case：未知股票 ZZZZ、未知 ETF FAKE、slow-ready、data-missing
- [x] iframe 同源 postMessage 汇总与独立 cache-buster
- [x] 每个 case 从空 `trfinance.*` localStorage / sessionStorage 沙盒启动
- [x] case 结束先卸载 iframe，再恢复用户原状态
- [x] `qaEmbed=1` 子页面 pagehide 不持久化测试导航状态
- [x] 交互上限使用 AbortController 真取消并等待清理；首页 20 秒、个股 / ETF 14 秒、异常 case 8–10 秒
- [x] 首页 QA 删除 AAPL 后故意写入并发 AMZN 状态，再执行撤销；只有股票 + ETF 两份列表精确恢复删除前快照才 PASS
- [x] 首页 QA 捕获“自选筛选 → 股票详情”来源，不真正导航；改乱状态后通过 synthetic `pageshow.persisted` 验证页签、筛选和滚动恢复
- [x] 首页 QA 同样验证“黄金 ETF 筛选 → ETF 详情”来源恢复
- [x] 上下文恢复期间 live region 使用 sentinel；恢复产生任何用户操作播报或恢复标记残留都 FAIL
- [x] 首页 QA 暂时改变 AAPL 自选并派发 storage / finance:resume，要求自选 DOM 通过 `FinanceAppState` 直接刷新，同时捕获 `.watch-filter` click；出现任何合成筛选 click 即 FAIL
- [x] 个股 QA 暂时移出当前股票自选 / 提醒后派发 storage，要求按钮同步；随后恢复数据并派发 finance:resume，要求按钮回到真实状态
- [x] ETF QA 暂时移出基金自选后派发 storage，要求关注按钮同步；随后恢复数据并派发 finance:resume，要求按钮回到真实状态
- [x] 首屏 + 当前渲染页面全长触控扫描
- [x] 四个一级页逐页审计横向溢出、固定底栏正文预留、禁区动作、可访问名称、触控目标
- [x] QA 工具 DOM、`inert`、`aria-disabled`、hidden input 不参与产品扫描
- [x] 合规扫描使用动作意图：按钮 / 短 CTA / aria-label / href 严格检查，财经新闻中的“交易量”等普通语义不误报
- [x] 深度交互捕获 `error` / `unhandledrejection`
- [x] 图表 QA 断言走势 / Kline / ETF role 与 aria-label 跟随模式和周期
- [x] 深度逐页核验 `FinanceResilienceHealth` 与 `finance-app-ready` / `aria-busy` / recovery DOM 一致
- [x] 未知股票 QA：不使用替代行情、不显示固定操作 / 分享、不生成图表/K线/详情导航
- [x] 未知 ETF QA：不使用 SPY 替代、不显示固定操作、不生成图表/详情导航
- [x] slow-ready QA：恢复条必须出现过，随后自动进入 ready 并移除；再次 resume 不回退
- [x] data-missing QA：保持 busy + recovery；resume 后仍保持 data-missing，不能误显示“网络已恢复”
- [x] 故障注入只在 `qa=1&qaEmbed=1` 时有效，正常 A 版与普通单页 QA 不触发

## 尚未关闭的验收项
- [ ] 在真实浏览器运行 A 版 `qa-suite.html`，清零实际 FAIL，并人工判断剩余 WARN
- [ ] 360–430px 实际 iPhone / Safari 人工视觉验收
- [ ] 桌面实际浏览器人工视觉验收
- [ ] Lighthouse Performance / Accessibility / Best Practices 最终检查
- [ ] V1 最终自测与 `V1 Complete` 标记

## 外部依赖
- 实时证券行情 API：待合法数据源 / 授权
- 实时新闻数据源：待合法数据源 / 授权
- 财报 / 评级 / SEC 等真实数据：待合法数据源确定
- 交易 / 基金销售：待牌照、合作方、KYC、隐私与协议完成后再评估

## 最近关键开发记录
### 第二十五至二十八轮：封板 QA 收口
- 扩大真实触控命中区，建立首屏 + 全长扫描。
- 四个一级页逐页检查溢出、固定层、交易边界、名称、触控。
- 修复图表辅助语义、iPhone safe-area、动态 sticky offset。
- 建立确定性 QA 沙盒、AbortController 真取消、动作意图合规扫描与韧性健康快照。

### 第二十九轮：异常路径可测试化与恢复链自动验收
- QA Suite 从 12 个常规 case 扩展到 16 个；新增未知股票、未知 ETF、慢加载恢复和数据源缺失恢复。
- 未知资产深度验收确认不回退到 AAPL / SPY，也不残留固定操作栏、分享、K线、图表或详情导航。
- 韧性层增加仅限 `qa=1&qaEmbed=1` 的确定性 `slow-ready` / `data-missing` 故障注入，正常产品完全不触发。
- `slow-ready` 在 QA 中先展示恢复条，再自动进入 ready；`data-missing` 保持 busy/recovery 并在 resume 后继续一致。
- 修复恢复条原因串台：只有真实 offline→online 才显示“网络已恢复”；data-missing / slow 使用对应原因文案。
- 未找到返回入口提升至 44px，恢复条按钮手机提升至 40px，异常页也维持与主产品一致的触控标准。
- 开发分支与 `finance-v1-preview` 的 resilience / QA / error-state CSS 已同步同一内容 SHA。

### 第三十轮：精确撤销与 BFCache 来源恢复确定性
- 自选删除从 toggle 式撤销改为删除前股票 / ETF 双快照；撤销直接写回原快照，不受 Toast 存活期间其他状态变化影响。
- `app.js` 的 live-region 播报识别 `__financeRestoringNavigation`，恢复期间的合成点击不再被念成用户主动操作。
- `navigation-memory.js` 用计数式恢复静默区包裹筛选和一级页合成点击，并暴露只读 `isRestoring()` 供 QA 断言。
- 首页深度 QA 新增精确撤销压力测试：删除 AAPL 后故意注入 AMZN，再撤销并要求两份自选列表与删除前完全一致。
- 首页深度 QA 新增两条上下文恢复测试：自选 / us → AAPL、基金 / gold → GLD；通过阻止真实导航的 click 捕获来源，再触发 `pageshow.persisted` 验证页面、筛选和滚动位置恢复。
- 上下文恢复 QA 使用 live-region sentinel 验证恢复过程静默；恢复标记未释放也会 FAIL。
- 首页交互预算单独提高到 20 秒，其他常规 / 异常 case 保持更短预算，避免慢 Safari 因新增恢复链误报超时。
- 开发分支与 A 版预览的 `app.js`、`navigation-memory.js`、`qa-interactions.js`、`qa-suite.html` 内容 SHA 已同步一致。

### 第三十一轮：详情控制状态恢复与跨标签一致性
- 新增 `detail-state-sync.js`，个股详情在 storage / finance:resume / pageshow.persisted 时重新读取当前股票的自选与提醒状态；ETF 详情重新读取基金关注状态。
- 同步层只更新按钮文本和 `aria-pressed`，不弹 Toast、不修改行情、图表或详情内容，不把恢复动作伪装成用户操作。
- 暴露只读 `FinanceDetailStateSync.snapshot()`，记录 asset type / symbol / valid / runs / lastReason / 当前 pressed 状态，便于 QA 判断实际触发来源。
- 新增仅 QA Suite 使用的 `qa-detail-state.js`，在现有个股 / ETF case 后附加 storage 与 finance:resume 状态同步测试；测试结束精确恢复本机列表 / 提醒。
- `stock.html` / `fund.html` 显式加载 `detail-state-sync.js`；开发分支与 A 版预览新脚本、详情页和 QA Suite 已同步。
- 本轮首先尝试从当前执行容器访问 RawGitHack，但 DNS 仍返回 temporary failure in name resolution，因此没有把真实浏览器 / iPhone / Lighthouse 标记为通过。

### 第三十二轮：首页直接刷新接口与合成点击清理
- 新增只读/安全的 `FinanceAppState`：仅提供自选、基金、我的重绘入口和当前页面 / 筛选 / 刷新次数快照，不开放交易或数据写入能力。
- `reference-features.js` 的自选 BFCache / `finance:resume` 与跨标签 `storage` 刷新改为调用 `FinanceAppState.refreshWatch()`，不再执行当前 `.watch-filter` 的 synthetic click。
- 直接刷新后仍在下一帧重新应用当前排序，因此自选列表、当前筛选和价格 / 涨跌幅排序保持一致。
- storage 的 `key=null` 也会触发安全刷新，兼容另一标签页执行整段 storage clear 的情况。
- `qa-detail-state.js` 扩展首页回归检查：修改 AAPL 自选、派发 storage / finance:resume，要求 DOM 与刷新快照同步，并捕获筛选按钮 click；任何合成筛选 click 都直接 FAIL。
- 开发分支与 A 版预览的 `app.js`、`reference-features.js`、`qa-detail-state.js` 内容 SHA 已同步一致。
- 本轮为代码与静态逻辑复核，没有把真实 iPhone / Safari、桌面浏览器或 Lighthouse 标记为通过。

### 第三十三轮：本地真实 QA 执行通道诊断
- 自动执行环境已确认具备 `/usr/bin/chromium` 与 Python Playwright，因此浏览器本身不再是阻塞项。
- 当前容器没有仓库 checkout；同时 `github.com`、`raw.githubusercontent.com`、`raw.githack.com`、`api.github.com` DNS 解析失败，Chromium / curl 无法取得 A 版源码。
- 已通过连接的 GitHub 通道确认 A 版目录可读取，并核对开发 / 预览 `navigation-memory.js` 内容 SHA 一致；未发现值得在无回归条件下继续强改的低风险产品缺陷。
- 本轮没有修改产品代码，也没有虚报 16-case、iPhone / Safari、桌面或 Lighthouse PASS；下一轮继续优先尝试恢复源码到本地 Chromium 的执行链。
- 保护边界核验：未 merge / rebase `main`，未触碰 SEO、Sitemap、`netlify.toml` 或生产部署 workflow；当前开发分支相对最新 `main` 为 ahead 184 / behind 78。

## 当前结论
当前状态：**V1 Candidate+ / 功能冻结**。

后续只做：
1. 运行 A 版 16-case `qa-suite.html`，清理实际 FAIL / WARN；
2. iPhone / Safari 与桌面人工视觉验收；
3. Lighthouse 最终检查；
4. 只修验收发现的具体问题；
5. 全部关闭后再标记 `V1 Complete`。

完整早期轮次历史保留在 Git 提交历史中，本文件作为当前权威 checkpoint 使用。