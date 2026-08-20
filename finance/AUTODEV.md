# 唐人财经 V1 开发规范与状态

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
- 新闻不是一级频道，而是行情 / 自选 / 基金 / 个股的解释层。
- 信息架构参考腾讯自选股；产品气质参考 Robinhood；代码、资产、交互均独立实现。
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
- [x] 最新价 / 涨跌幅升降序与恢复原顺序
- [x] 排序偏好本机保存；BFCache 返回后重新读取并应用

### ETF / 基金
- [x] ETF 主题研究页与核心指数 / 科技 / 黄金 / 半导体真实筛选
- [x] 参数化 ETF 详情：费率、规模、风险、持仓、资讯
- [x] 走势图区间切换与键盘 / 触摸读数
- [x] 不加载股票专属 K 线增强层

### 个股详情
- [x] 当前价、涨跌、盘后、高低价、成交量
- [x] 1D / 1W / 1M / 3M / YTD / 1Y / 5Y 与所选周期收益联动
- [x] 走势 / K线，日K / 周K / 月K，OHLC + 成交量
- [x] K线语义约束：日K≥1M、周K≥3M、月K≥1Y
- [x] 鼠标 / 触摸 / 键盘图表读取
- [x] sticky 顶部迷你报价与当前周期 / 图表读数一致
- [x] 关键数据、新闻、评级、财务、EPS、SEC接口位、热度、公司概览
- [x] 加入自选、提醒、分享

### 导航 / 恢复 / 韧性
- [x] 详情 sticky 分区导航与当前阅读分区高亮
- [x] 来源自适应返回，session 级筛选与滚动恢复
- [x] Safari / BFCache 页面恢复与 visualViewport / iPhone 键盘处理
- [x] 弱网 / 离线 / 加载失败恢复条与空状态操作入口
- [x] readiness observer 完成后断开，多恢复事件合并，sessionStorage 滚动写入节流
- [x] 个股 / ETF 顶部栏显式使用 iPhone safe-area-inset-top
- [x] 详情 sticky 分区 top 与锚点 scroll-margin 同步 safe-area
- [x] IntersectionObserver 使用真实顶部栏 + 分区导航高度，不再写死 118px

### 视觉 / 响应式 / 无障碍
- [x] A 版设计系统与 360–430px 静态防溢出
- [x] 900 / 1180 / 1440+ 桌面布局
- [x] content-visibility、focus-visible、reduced-motion、高对比基础支持
- [x] 行情数字 tabular numerals
- [x] 详情分区 / 图表区间 / 自选排序 / K线模式手机触控高度 ≥40px
- [x] 返回箭头 / 分享按钮命中区 ≥44×44px
- [x] 自选管理、删除、Toast 撤销手机命中区 ≥40px
- [x] 偏好 Toggle 使用 56×40 按钮命中区，视觉轨道保持 48×28
- [x] “清除 / 关闭”等短文字按钮最小宽度 44px，提醒行链接最小高度 44px
- [x] 顶部品牌入口保持最小 40px 命中高度
- [x] 个股 / ETF 顶部左右操作槽统一 64px，迷你报价真正几何居中
- [x] 股票 / ETF 图表使用 `role="group"`，aria-label 随走势 / K线 / 周期实时同步

## QA / 验收基础设施
- [x] `acceptance-check.js`：仅 `qa=1` 时加载
- [x] `qa-suite.html`：首页 / AAPL / QQQ × 360 / 390 / 430 / 1280px，共 12 个独立 case
- [x] iframe 同源 postMessage 汇总与独立 cache-buster
- [x] `qa-interactions.js` 自动真实操作搜索、导航、自选排序、ETF筛选、K线、YTD、键盘图表读取
- [x] 条件等待代替固定 sleep
- [x] 每个 case 深度交互内部双重恢复所有 `trfinance.*` localStorage / sessionStorage，并验证恢复一致性
- [x] QA Suite 在每个 case 加载前暂存用户状态并清空 `trfinance.*`，确保确定性空基线启动
- [x] case 完成后先卸载 iframe，再恢复用户 localStorage / sessionStorage，避免旧页面 `pagehide` 反写
- [x] `qaEmbed=1` 子页面的导航记忆层在 `pagehide` 禁止持久化测试状态
- [x] 14 秒深度交互上限使用 AbortController 真取消；主流程等待取消清理完成后才恢复用户状态
- [x] 首屏触控扫描 + 当前渲染页面全长触控扫描
- [x] 四个一级页逐页审计横向溢出、交易 / 开户禁区入口、可访问名称、触控目标
- [x] 深度逐页审计同时检查固定底栏 / 详情操作栏正文预留
- [x] 可操作控件名称审计覆盖 a / button / input / tabindex=0
- [x] 深度交互捕获 `error` / `unhandledrejection` 并作为正式 PASS / FAIL
- [x] 图表 QA 断言走势 / Kline / ETF 的 role 与 aria-label 跟随模式和周期
- [x] 固定底栏 / 详情操作栏按真实高度 + bottom 距离校验正文底部预留，不足直接 FAIL
- [x] 手机触控 WARN 阈值 36px，桌面 32px
- [x] 深度交互超时 14 秒 / 整 case 24 秒，降低慢 Safari 误报

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
### 第十九轮：Robinhood / 腾讯截图对照
- 补自选排序、所选周期收益、走势 / K线与 OHLC。
- 明确不增加 Trade、开户、模拟交易与无授权研报。

### 第二十至二十四轮：封板与 QA 基础设施
- reference 确定性加载、等宽数字、搜索 / BFCache / K线语义缺陷修复。
- 建立单页 `qa=1`、12 视口 QA 与深度真实交互 QA。
- 条件等待、双重状态恢复、触控尺寸收口。

### 第二十五轮：QA FAIL / WARN 清零工程
- 扩大真实触控命中区：Toggle、自选管理 / 删除 / 撤销、详情返回 / 分享。
- QA 从首屏触控扫描扩展为首屏 + 当前渲染页面全长扫描。
- 首页自动切换基金 / 自选 / 我的 / 行情，并分别检查横向溢出、禁区入口、可访问名称与触控尺寸。
- 禁区扫描从“首屏可见”提升为“当前渲染页面全部可交互元素”。
- 新增可访问名称审计，覆盖链接、按钮、输入框与 tabindex=0 控件。
- 深度交互期间捕获 `window error` / `unhandledrejection`，出现异常直接 FAIL。
- 修复股票 / ETF 图表辅助语义：`role="group"` 与 aria-label 随走势、K线、日K / 周K / 月K、区间同步。
- 深度 QA 新增 K线 / 走势 / ETF 图表辅助语义断言。
- 因验收链变长，将深度交互超时调整为 14 秒、整 case 24 秒。
- 已同步到 `finance-v1-preview`。

### 第二十六轮：安全区、固定层与剩余触控收口
- 补齐个股 / ETF sticky 顶栏 `safe-area-inset-top`，避免 `viewport-fit=cover` 下贴入 iPhone 状态栏 / 刘海区域。
- 详情分区导航的 sticky top、各分区 scroll-margin 同步安全区；430px 紧凑顶栏同样使用 `calc(... + env(safe-area-inset-top))`。
- 分区高亮 IntersectionObserver 不再写死 `118px`，运行时测量顶部栏与分区导航真实高度；方向切换 / viewport 变化时按需重建 observer。
- 个股 / ETF 顶部左右槽统一 64px，迷你报价从视觉近似居中改为真正几何居中。
- “清除 / 关闭”等短文字按钮补最小 44px 宽，提醒链接补 44px 高，紧凑品牌入口保持 40px 命中高度。
- 核对底部安全区后保留 A 版既有 `bottom:9px + 内部 safe-area padding` 策略，没有为了不存在的“双算”问题改动成熟样式。
- QA 新增固定底栏正文预留硬检查：比较实际固定层高度、bottom 距离和页面 padding-bottom，发生覆盖风险直接 FAIL。
- 已同步到 `finance-v1-preview`。

### 第二十七轮：确定性 QA 沙盒与可取消超时
- 修正旧 QA“加载后才快照”的缺陷：用户已有自选、排序、筛选、提醒不再参与 12 个 case 的初始化。
- QA Suite 整轮开始先保存用户 `trfinance.*`；每个 case 加载前清空 localStorage / sessionStorage 中的财经命名空间，形成一致的演示默认起点。
- case 结束先把 iframe 导航到 `about:blank` 并等待旧文档卸载，再恢复用户状态，避免旧页面生命周期在恢复后反写测试值。
- `qaEmbed=1` 时 navigation-memory 的 `pagehide` 只清理待写 timer，不落盘；正常产品页面行为不变。
- 深度交互超时从不可取消 `Promise.race` 改为 AbortController；14 秒达到上限后真正停止等待链，仍执行状态恢复和异常监听清理，再向 Suite 返回。
- QA 报告新增“case 从空 trfinance.* 基线启动”断言，并在深度切换基金 / 自选 / 我的 / 行情时同步检查固定底栏正文预留。
- 开发分支与 A 版预览已同步同一 QA / navigation-memory 实现。
- 本轮为静态代码复核，未把真实 iPhone / Safari、桌面浏览器或 Lighthouse 标记为通过。

## 当前结论
当前状态：**V1 Candidate+ / 功能冻结**。

后续只做：
1. 运行 A 版 `qa-suite.html`，清理实际 FAIL / WARN；
2. iPhone / Safari 与桌面人工视觉验收；
3. Lighthouse 最终检查；
4. 只修验收发现的具体问题；
5. 全部关闭后再标记 `V1 Complete`。

完整早期轮次历史仍保留在 Git 提交历史中，本文件作为当前权威 checkpoint 使用。
