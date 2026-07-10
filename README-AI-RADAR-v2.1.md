# 唐人日报 X 新闻雷达 v2.1

本版本保留现有 GitHub Actions、Netlify 和页面结构，只升级特朗普与 ICE 的 X 抓取和候选新闻处理。

## 已启用

- 特朗普：官方账号、白宫账号、主流媒体、观察账号、全网关键词雷达。
- ICE：ICE/HSI/DHS/CBP/DOJ、主流媒体、英文全网雷达、西语社区雷达。
- 每个搜索通道保存独立 X 游标，降低漏抓风险。
- 所有新线索先进入候选池；超出单轮 AI 处理额度的内容下轮继续处理。
- 官方与预设可信媒体经 AI 验证后可自动发布；其他来源保留在候选池等待复核。
- AI 输出包含相关度、重要性、可信等级、来源权重和匹配关键词。
- 支持 X 原帖图片、近似新闻去重、失败重试和中断恢复。

## 必需的 GitHub Secrets

- `X_BEARER_TOKEN`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`（可选；未设置时使用脚本默认模型）

## 候选池与状态

- `data/trump-pending.json`
- `data/ice-pending.json`
- `data/trump-state.json`
- `data/ice-state.json`

自动任务仍按约每 30 分钟运行，特朗普与 ICE 错峰执行。
