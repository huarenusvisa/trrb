#!/usr/bin/env node
import fs from 'node:fs';

const productionPath = process.argv[2] || 'round12-production-audit.json';
const mobilePath = process.argv[3] || 'round12-mobile-visual.json';
const nodeNames = [
  '文章发布链路一致性治理',
  '全站文章链接实时存活检查',
  '文章修改、删除与下线机制收口',
  '站内搜索系统优化',
  '首页热榜与推荐数据一致性',
  '新闻图片与封面链路加固',
  '全站缓存/CDN策略优化',
  'iPhone / Android真实移动端深度验收',
  '3329+文章规模索引与死链审计',
  '第十二轮最终生产总验收'
];

function readJson(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing required report: ${path}`);
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}
function nodeStatus(report, index) {
  const node = report?.nodes?.[String(index)] ?? report?.nodes?.[index];
  return String(node?.status || '').toLowerCase();
}

const production = readJson(productionPath);
const mobile = readJson(mobilePath);
const statuses = {};
for (let i = 1; i <= 7; i++) statuses[i] = nodeStatus(production, i) === 'pass';
statuses[8] = Array.isArray(mobile?.failures) && mobile.failures.length === 0;
statuses[9] = nodeStatus(production, 9) === 'pass';
statuses[10] = Array.from({length:9}, (_,i) => statuses[i+1]).every(Boolean);

const result = {
  generated_at: new Date().toISOString(),
  nodes: Object.fromEntries(nodeNames.map((name, i) => [String(i+1), {name, status: statuses[i+1] ? 'pass' : 'failed'}])),
  production_hard_failures: Array.isArray(production?.failures) ? production.failures.length : null,
  mobile_failures: Array.isArray(mobile?.failures) ? mobile.failures.length : null,
  passed: Object.values(statuses).filter(Boolean).length
};
fs.writeFileSync('round12-final-closeout.json', JSON.stringify(result, null, 2) + '\n');
for (let i = 1; i <= 10; i++) console.log(`node ${i}: ${statuses[i] ? 'pass' : 'failed'} — ${nodeNames[i-1]}`);
if (!statuses[10]) {
  console.error(`ROUND 12: ${result.passed}/10 — NOT CLOSED`);
  process.exit(1);
}
console.log('ROUND 12: 10/10 PASS');
