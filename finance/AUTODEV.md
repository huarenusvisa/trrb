# 唐人财经 V1 当前权威开发状态

## 当前最高优先级
PC 端交互版生产上线与验收。`main` 已接入交互型 `finance/` 前端，基线 commit=`ba83050a0ebc4ac6653fa7dae7e678544fd69700`。不得退回静态 UI 预览版。

## 仓库与保护边界
- Repository: `huarenusvisa/trrb`
- Development: `finance-v1-robinhood`
- Preview: `finance-v1-preview`
- 允许仅将已验收的纯 `finance/` 交互文件安全同步到 `main`；不得覆盖或修改其他栏目和全站文件。
- 不 merge / rebase `main`。
- 不修改 `netlify.toml`、SEO 脚本、SEO 诊断/验收脚本、Sitemap、生产部署 workflow。
- 保持功能冻结；除非真实验收确认缺失，否则不扩新模块。

## V1 合规边界
- 保持 `brokerage=false`、`liveMarketData=false`、`trading=false`。
- 不开放真实开户、Trade/下单、KYC、基金购买/申购、券商账户连接。
- demo/fallback 数据必须明确标识；真实行情数据接入单独后续处理，不阻碍前端交互上线。

## PC 端必须保留的交互能力
- 搜索股票 / ETF / 基金。
- 自选增删、撤销、分类筛选。
- 列表 / 热力图切换。
- 行情“现在 / 即将 / 宏观 / 加密”Tab。
- ETF 主题筛选。
- 个股 / ETF 详情。
- K 线时间范围切换。
- 浏览器返回 / Hash 状态恢复。
- 离线 / 加载恢复。
- 键盘与无障碍基础。

## 当前生产状态
- `main` 最新提交：`a7abbc3776dabb1c67abc49599df376e7d5ab830`，为 SEO diagnostic bot 的 `[skip ci]` 报告更新；未改变财经交互基线。
- Netlify 项目：`trrb`，siteId=`b30280d2-b4f8-4a19-9135-862dd9c7171f`。
- 当前生产 deploy=`6a877d1a88ea9600081f44b8`，state=`ready`，published_at=`2026-08-20T22:18:33.889Z`。
- 该生产 deploy 的 commit_ref=`366d8e3f081ca767e0923c07ae5e7f5d6d6e1631`。
- GitHub compare 已确认 `366d8e3f...` 相对 `ba83050a...` 为 ahead 2 / behind 0，因此当前生产 deploy 已包含交互版财经基线。
- 生产 deploy commit 中 `finance/index.html`、`finance/stock.html`、`finance/fund.html` 均为交互版文件；个股与 ETF 详情页保留时间范围切换、自选、返回状态等交互入口。
- 生产 deploy commit 中 `finance/feature-flags.js` 仍为 `brokerage=false`、`liveMarketData=false`、`trading=false`。

## 当前外部验收阻塞
- Netlify 生产 deploy 本身为 READY，且已确认包含交互版源码。
- 当前执行容器对 `trrb.net` 仍发生 DNS `Temporary failure in name resolution`，因此本轮无法从该容器真实打开 `/finance/`、`/finance/stock.html`、`/finance/fund.html` 做浏览器级点击验收。
- 这属于外部 QA 执行通道阻塞，不是已确认的财经产品 FAIL。
- 不虚报 PC 浏览器交互、iPhone/Safari 或 Lighthouse PASS。

## 当前 QA 基础设施
- `acceptance-check.js`：仅 `qa=1` 加载。
- `qa-interactions.js`：覆盖搜索、四栏导航、自选排序/撤销、ETF筛选、K线/YTD、键盘图表读取。
- `qa-detail-state.js`：验证 storage、finance:resume、BFCache 恢复；BFCache 断言 page / marketPanel / watchFilter / fundFilter 全恢复且 synthetic click=0。
- `qa-suite.html`：16 case = 首页/AAPL/QQQ × 360/390/430/1280 + 未知股票 + 未知ETF + slow-ready + data-missing。

## 尚未关闭的上线验收
- [ ] 在可联网的真实浏览器环境实测生产 `/finance/`、`/finance/stock.html`、`/finance/fund.html`。
- [ ] 真实 Chromium 运行 16-case，清零实际 FAIL，人工判断 WARN。
- [ ] PC 桌面实际浏览器交互与视觉验收。
- [ ] 360–430px 实际 iPhone / Safari 人工视觉验收。
- [ ] Lighthouse Performance / Accessibility / Best Practices。
- [ ] V1 最终自测并标记 `V1 Complete`。

## 本轮
- 读取并遵守上一版 checkpoint 后，将最高优先级切换为“PC 端交互版生产上线与验收”。
- 核验 `main` 最新提交与 Netlify 当前生产 deploy。
- 确认生产 deploy READY，且 commit_ref 明确包含 `ba83050a...` 交互版财经基线。
- 核验生产 commit 中首页、个股页、ETF页及 feature flags；未发现需要静态低风险修复的新缺陷。
- 尝试真实访问 `https://trrb.net/finance/`、`stock.html`、`fund.html`，执行容器仍因 DNS 无法解析 `trrb.net` 而受阻。
- 因没有真实产品 FAIL/WARN，本轮停止新增产品代码，不为制造进度改动核心交互。

## 当前结论
状态：**生产交互版已部署 / V1 Candidate+ / 外部浏览器验收待完成**。

下一步优先级：
1. 一旦外部访问通道恢复，立即实测生产三页并跑 PC 交互验收。
2. 能运行 QA 时优先跑 16-case；只修真实 FAIL/WARN。
3. 完成 PC、iPhone/Safari、Lighthouse 后再标记 `V1 Complete`。
