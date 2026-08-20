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
V1 不开放：
- 开户
- Trade / 下单
- KYC
- 基金购买 / 申购
- 券商账户连接

当前数据为明确标识的 demo / fallback：
- 未知股票 / ETF 返回未找到，不用 AAPL / SPY 冒充。
- 历史区间与 K 线明确标记演示。
- 不硬编码 secrets。
- 真实行情、新闻、财报、评级后续必须使用合法授权或合规数据源。

## 当前完成状态
### 首页与行情
- [x] 三大指数、微型走势、市场状态
- [x] 热力图、Top Movers
- [x] Earnings / Upcoming / Macro / Crypto
- [x] 市场新闻解释层
- [x] 搜索股票 / ETF / 基金
- [x] 最近浏览 / 热门搜索快捷入口
- [x] 搜索键盘上下、Enter、Escape、ARIA 状态
- [x] Hash 路由与浏览器前进 / 后退

### 自选
- [x] 股票 + ETF 统一自选
- [x] 全部 / 美股 / 中概 / ETF / 港股 / 沪深筛选
- [x] 列表 / 热力视图
- [x] 管理模式、移除、撤销
- [x] 最新价 / 涨跌幅升降序
- [x] 恢复原自选顺序
- [x] 排序偏好本机保存
- [x] BFCache 返回后重新读取并应用本机自选状态

### ETF / 基金
- [x] ETF 主题研究页
- [x] 核心指数 / 科技 / 黄金 / 半导体真实筛选
- [x] 参数化 ETF 详情
- [x] 费率、规模、风险、持仓、资讯
- [x] 走势图区间切换与键盘 / 触摸读数
- [x] 不加载股票专属 K 线增强层

### 个股详情
- [x] 参数化详情
- [x] 当前价、涨跌、盘后、高低价、成交量
- [x] 1D / 1W / 1M / 3M / YTD / 1Y / 5Y
- [x] 所选周期收益联动
- [x] 走势 / K线切换
- [x] 日K / 周K / 月K
- [x] OHLC + 成交量读数
- [x] K线语义约束：日K≥1M、周K≥3M、月K≥1Y
- [x] 鼠标 / 触摸 / 键盘图表读取
- [x] sticky 顶部迷你报价与当前周期一致
- [x] K线收盘读数与顶部报价联动
- [x] 关键数据、新闻、评级、财务、EPS、SEC接口位、热度、公司概览
- [x] 加入自选、提醒、分享

### 导航 / 恢复 / 韧性
- [x] 详情 sticky 分区导航
- [x] 当前阅读分区自动高亮
- [x] 从行情 / 自选 / 基金 / 我的进入详情时记住来源
- [x] 返回来源自适应
- [x] session 级筛选与滚动恢复
- [x] Safari / BFCache 页面恢复
- [x] visualViewport / iPhone 键盘状态处理
- [x] 弱网 / 离线 / 加载失败恢复条
- [x] 自选 / ETF / 浏览 / 提醒空状态操作入口
- [x] 页面加载完成后 readiness observer 主动断开
- [x] Safari 多恢复事件合并
- [x] sessionStorage 滚动写入节流

### 视觉 / 响应式 / 无障碍
- [x] A 版设计系统
- [x] 360–430px 静态防溢出
- [x] 900 / 1180 / 1440+ 桌面布局
- [x] content-visibility 下屏性能优化
- [x] focus-visible / reduced-motion / 高对比基础支持
- [x] 行情数字使用 tabular numerals
- [x] 详情分区导航桌面触控高度 ≥36px
- [x] 详情分区导航手机触控高度 ≥40px
- [x] 图表时间区间手机触控高度 ≥40px
- [x] 自选排序与 K 线模式按钮手机触控高度 ≥40px
- [x] 触控增高后手机锚点 scroll-margin 同步为 126px

## QA / 验收基础设施
- [x] `acceptance-check.js`：仅 `qa=1` 时加载
- [x] 单页 QA：重复 ID、横向溢出、交易入口、ARIA、触控目标、runtime 等
- [x] `qa-suite.html`：12 个独立视口 case
- [x] 首页 / AAPL / QQQ × 360 / 390 / 430 / 1280px
- [x] iframe 同源 postMessage 汇总
- [x] 每个 case 独立 cache-buster
- [x] `qa-interactions.js` 深度真实交互测试
- [x] 自动搜索、导航、自选排序、ETF筛选、K线、YTD、键盘图表读取
- [x] 条件等待代替固定 25–70ms sleep
- [x] 每个 case 前后快照并双重恢复所有 `trfinance.*` localStorage / sessionStorage
- [x] QA 报告验证状态恢复一致性
- [x] 触控扫描只检查当前视口内、非 disabled 的真实可操作元素
- [x] 手机触控 WARN 阈值 36px，桌面 32px
- [x] 深度交互超时 10 秒 / 整 case 18 秒，降低慢 Safari 误报

## 尚未关闭的验收项
- [ ] 360–430px 实际 iPhone / Safari 人工视觉验收
- [ ] 桌面实际浏览器人工视觉验收
- [ ] Lighthouse 性能 / Accessibility / Best Practices 最终检查
- [ ] 根据真实 QA 报告清零 FAIL，并人工判断剩余 WARN
- [ ] V1 最终自测与 `V1 Complete` 标记

## 外部依赖
- 实时证券行情 API：待合法数据源 / 授权
- 实时新闻数据源：待合法数据源 / 授权
- 财报 / 评级 / SEC 等真实数据：待合法数据源确定
- 交易 / 基金销售：待牌照、合作方、KYC、隐私与协议完成后再评估

## 最近关键开发记录
### 第十九轮：Robinhood / 腾讯截图对照
- 补自选最新价 / 涨跌幅排序。
- 补所选周期收益联动。
- 补走势 / K线、日K / 周K / 月K、OHLC 与成交量。
- 明确不增加 Trade、开户、模拟交易与无授权研报。

### 第二十轮：封板前确定性加载
- reference 增强改为页面明确依赖。
- ETF 不下载股票专属增强。
- 行情数字统一等宽数字。

### 第二十一轮：封板缺陷扫描
- 修复 Escape 搜索状态残留。
- 清除本机数据覆盖排序与 session 导航状态。
- sticky 报价与当前周期统一。
- K线周期语义约束。
- 建立单页 `qa=1` 运行时验收。

### 第二十二轮：多视口 QA
- 新增 12 case 自动验收套件。
- 首页 / 个股 / ETF × 360 / 390 / 430 / 1280px。
- 汇总 PASS / FAIL / WARN 与 JSON 报告。

### 第二十三轮：真实交互 QA
- 新增 `qa-interactions.js`。
- 自动真实执行搜索、四栏切换、自选排序、ETF筛选、K线切换、周期约束、YTD同步和图表键盘读取。
- 每个 case 快照 / 恢复 `trfinance.*` 状态，避免 QA 污染用户自选与提醒。

### 第二十四轮：QA 自校验与触控收口
- 固定毫秒 sleep 改为 `waitFor` 条件等待，降低 Safari / 低电量模式误报。
- 状态恢复改为双重恢复，并增加恢复一致性 PASS / FAIL 检查。
- QA 触控扫描改为仅扫描当前视口内、非 disabled 的真实交互元素。
- 自选排序、走势 / K线、日K / 周K / 月K、详情分区导航、图表时间区间提高实际触控高度。
- 手机详情导航变高后同步调整锚点 `scroll-margin-top`，避免点击分区后标题被 sticky 导航遮挡。
- QA 交互超时提高至 10 秒、整 case 18 秒，避免慢设备误判。
- 已同步到 `finance-v1-preview`。

## 当前结论
当前状态：**V1 Candidate+ / 功能冻结**。

不再扩大型模块。后续只做：
1. 运行 A 版 `qa-suite.html`，清理实际 FAIL / WARN；
2. iPhone / Safari 与桌面人工视觉验收；
3. Lighthouse 最终检查；
4. 只修验收发现的具体问题；
5. 全部关闭后再标记 `V1 Complete`。

完整早期轮次历史仍保留在 Git 提交历史中，本文件从第24轮起作为当前权威 checkpoint 使用。
