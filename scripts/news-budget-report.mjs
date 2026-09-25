import {appendFileSync} from 'node:fs';
import {budgetDatabase} from './news-budget-preload.mjs';
const report=await budgetDatabase().rpc('news_budget_report');
console.log(JSON.stringify({event:'shared-news-budget',...report},null,2));
if (process.env.GITHUB_STEP_SUMMARY) {
  const usd=n=>`$${(Number(n || 0)/1e6).toFixed(2)}`;
  const rows=report.totals || [];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n## 新闻机器人共享预算（${report.month_utc} UTC）\n\n目标 $1,000/月，API 计量上限 $900/月，初月按剩余天数折算。保守估算，未结算预留仍占额度。\n\n| 机器人 | 服务 | 本月含预留 | 今日 | 待结算预留 |\n|---|---|---:|---:|---:|\n${rows.map(r=>`| ${r.pipeline} | ${r.provider} | ${usd(r.budget_used_micros)} | ${usd(r.today_micros)} | ${usd(r.unresolved_micros)} |`).join('\n')}\n\n统计开始：${report.policy.tracking_started_at}；不含此前账单、站点套餐或其他应用调用。\n`);
}
