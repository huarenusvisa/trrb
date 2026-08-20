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
- `feature-flags.js` 当前复核：`brokerage=false`、`liveMarketData=false`、`trading=false`。
- demo/fallback 数据必须明确标识；未知股票/ETF 不得用 AAPL/SPY 冒充。

## 已封板核心能力
- 首页、搜索、自选、ETF/基金、个股详情、Hash 路由、BFCache/Safari 恢复、韧性状态、移动/桌面适配与无障碍基础均已进入 Candidate+。
- `FinanceAppState.setPage / setMarketPanel / setWatchFilter / setFundFilter` 已 setter 化；恢复路径不再通过 synthetic click 恢复一级页、行情 Tab、自选筛选或 ETF 主题。

## 当前 QA 基础设施
- `acceptance-check.js`：仅 `qa=1` 加载。
- `qa-interactions.js`：覆盖搜索、四栏导航、自选排序/撤销、ETF筛选、K线/YTD、键盘图表读取。
- `qa-detail-state.js`：验证 storage、finance:resume、BFCache 恢复；BFCache 断言 page / marketPanel / watchFilter / fundFilter 全恢复且 synthetic click=0。
- `qa-suite.html`：16 case = 首页/AAPL/QQQ × 360/390/430/1280 + 未知股票 + 未知ETF + slow-ready + data-missing。

## 尚未关闭的上线验收
- [ ] 真实 Chromium/浏览器运行 A 版 `qa-suite.html`，清零实际 FAIL，人工判断 WARN。
- [ ] 360–430px 实际 iPhone / Safari 人工视觉验收。
- [ ] 桌面实际浏览器人工视觉验收。
- [ ] Lighthouse Performance / Accessibility / Best Practices。
- [ ] V1 最终自测并标记 `V1 Complete`。

## 当前执行阻塞
- Chromium + Python Playwright 可用。
- GitHub Connector 可读取 `finance-v1-preview/finance/` 全部 A 版源码与 QA 文件。
- 当前执行容器仍无法通过 DNS 直接访问 GitHub/RawGitHack/API GitHub/Netlify/trrb.net，不能直接下载 A 版或打开远程预览。
- A 版预览 PR #23（`finance-v1-preview` → `main`）仍为 draft/open；当前 head=`aab777a16ecb88466c297dfc3f239257a0269309`。
- 当前 head 的 `netlify/trrb/deploy-preview` 已落为 `failure`，目标 deploy=`6a8761eae70c0a00087858b9`；仍无可用预览页供 Chromium 直接执行 16-case。
- 目前没有新的真实产品 FAIL/WARN 证据，因此不继续无依据修改核心产品代码。

## 本轮（第45轮）
- 先读取并遵守本文件第44轮 checkpoint。
- 复核 PR #23：仍 draft/open、未合并，当前 head=`aab777a16ecb88466c297dfc3f239257a0269309`。
- 复核当前 head 的 Netlify Deploy Preview：`failure`，deploy=`6a8761eae70c0a00087858b9`；没有把预览基础设施失败误判为财经产品 FAIL。
- 重新比较 `main...finance-v1-robinhood`：status=`diverged`，财经分支 ahead 199 / behind 206；GitHub compare 返回的全部差异文件仍位于 `finance/`，未触碰保护范围。
- 本轮未发现新的、可静态确定且值得冒险修改的封板缺陷，因此按功能冻结要求停止新增产品代码，不虚报 16-case、iPhone、桌面或 Lighthouse PASS。

## 当前结论
状态：**V1 Candidate+ / 功能冻结**。

下一步优先级：
1. 优先恢复可用的 A 版真实预览/源码落盘通道，再以真实 Chromium 跑 `qa-suite.html` 16-case。
2. 若真实 QA 出现 FAIL/WARN，只修具体缺陷，并同步 `finance-v1-robinhood` 与 `finance-v1-preview`。
3. 完成 iPhone/Safari、桌面、Lighthouse。
4. 全部关闭后标记 `V1 Complete`。

完整早期历史保留在 Git 提交历史中，本文件仅保留当前可执行 checkpoint。
