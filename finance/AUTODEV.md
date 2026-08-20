# 唐人财经 V1 当前权威开发状态

## 仓库与保护边界
- Repository: `huarenusvisa/trrb`
- Development: `finance-v1-robinhood`
- Preview: `finance-v1-preview`
- 不 merge / rebase `main`。
- 财经封板仅允许修改 `finance/`；不得修改 `netlify.toml`、SEO 脚本、SEO 诊断/验收脚本、Sitemap、生产部署 workflow 或无关生产功能。
- 保持功能冻结；除非真实验收确认缺失，否则不扩新模块。

## V1 合规边界
- 一级导航：自选｜行情｜基金｜我的；默认行情。
- 新闻是解释层，不是一级频道。
- V1 不开放开户、Trade/下单、KYC、基金购买/申购、券商账户连接。
- `feature-flags.js` 当前确认：`brokerage=false`、`liveMarketData=false`、`trading=false`。
- demo/fallback 数据必须明确标识；未知股票/ETF 不得用 AAPL/SPY 冒充。

## 已封板核心能力
- 首页：三大指数、走势、市场状态、热力图、Top Movers、财报/宏观/加密/新闻解释层。
- 搜索：股票/ETF/基金；键盘上下、Enter、Escape、ARIA。
- 自选：股票+ETF统一；全部/美股/中概/ETF/港股/沪深；列表/热力图、排序、管理、精确撤销。
- ETF/基金：主题筛选、参数化详情、费率/规模/风险/持仓/资讯、走势图。
- 个股：1D/1W/1M/3M/YTD/1Y/5Y；走势/K线；日K/周K/月K；OHLC+成交量；鼠标/触摸/键盘读取；自选/提醒/分享。
- 导航/恢复：Hash 路由、前进后退、详情来源自适应返回、Safari/BFCache/visualViewport/iPhone 键盘处理。
- `FinanceAppState.setPage / setMarketPanel / setWatchFilter / setFundFilter` 已完成 setter 化；恢复路径不再用 synthetic click 恢复一级页、行情 Tab、自选筛选或 ETF 主题。
- 韧性：offline / data-missing / slow 分离；弱网/离线/加载失败恢复条。
- 视觉/无障碍：360–430px 静态防溢出；900/1180/1440+ 桌面布局；safe-area、reduced-motion、高对比、focus-visible、关键触控目标与图表 ARIA。

## 当前 QA 基础设施
- `acceptance-check.js`：仅 `qa=1` 加载。
- `qa-interactions.js`：真实操作搜索、四栏导航、自选排序、精确撤销、ETF筛选、K线、YTD、键盘图表读取。
- `qa-detail-state.js`：验证首页/个股/ETF 的 storage、finance:resume、BFCache 恢复。
- BFCache 断言：page / marketPanel / watchFilter / fundFilter 全恢复，且四类导航控件 synthetic click 次数必须为 0。
- `qa-suite.html`：16 case = 首页/AAPL/QQQ × 360/390/430/1280 + 未知股票 + 未知ETF + slow-ready + data-missing。
- 每 case 使用独立 `trfinance.*` localStorage/sessionStorage 沙盒；深度交互捕获 `error` / `unhandledrejection`。

## 尚未关闭的上线验收
- [ ] 在真实 Chromium/浏览器运行 A 版 `qa-suite.html`，清零实际 FAIL，人工判断 WARN。
- [ ] 360–430px 实际 iPhone / Safari 人工视觉验收。
- [ ] 桌面实际浏览器人工视觉验收。
- [ ] Lighthouse Performance / Accessibility / Best Practices。
- [ ] V1 最终自测并标记 `V1 Complete`。

## 当前执行阻塞
- Chromium + Python Playwright 可用。
- GitHub Connector 可以读取 `finance-v1-preview/finance/` 中全部 A 版源码与 QA 文件。
- 但当前执行容器无法通过 DNS 访问 GitHub/RawGitHack/API GitHub，Connector 也没有直接把整套目录落盘到 Chromium 本地目录的动作，因此 16-case 尚未真实执行。
- 这是 QA 执行通道阻塞，不是已确认产品缺陷；在真实回归条件缺失时，不继续无依据修改核心产品代码。

## 最近关键封板事实
- 第31–35轮：详情状态同步、首页直接刷新、setter 化、恢复链移除 synthetic click、增加 BFCache 四类状态回归。
- 第36–40轮：反复确认 Chromium/Playwright 正常、外网 DNS 失败、现有 CI 无可直接复用 finance 浏览器验收 workflow、A版 `preview.html` 只是同目录 `index.html#market` 包装器；未发现新的确定性状态恢复缺陷。
- 第41轮：重新读取权威 checkpoint；确认 `feature-flags.js` 三个交易/实时能力旗标仍全部为 false；重新比较 `main...finance-v1-robinhood`，状态 diverged，财经分支 ahead 195 / behind 125，当前 compare 返回的差异文件全部位于 `finance/`，未触碰保护范围。A版 `qa-suite.html` 仍为完整16-case入口。由于真实浏览器源码落盘通道仍未打通，本轮不新增产品代码、不虚报 iPhone/桌面/Lighthouse/16-case PASS。

## 当前结论
状态：**V1 Candidate+ / 功能冻结**。

下一步优先级：
1. 优先打通 A 版源码落盘 → localhost → Chromium → 16-case。
2. 若真实 QA 出现 FAIL/WARN，只修具体缺陷，并同步 `finance-v1-robinhood` 与 `finance-v1-preview`。
3. 完成 iPhone/Safari、桌面、Lighthouse。
4. 全部关闭后标记 `V1 Complete`。

完整早期历史保留在 Git 提交历史中，本文件仅保留当前可执行 checkpoint。
