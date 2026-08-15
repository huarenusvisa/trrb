import { readFileSync, writeFileSync } from 'node:fs';

const checks = [];
let failures = 0;
function check(ok, label, detail = '') {
  checks.push({ ok: Boolean(ok), label, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

const workflowPath = '.github/workflows/round16-node1-legal-source-sync.yml';
const workflow = readFileSync(workflowPath, 'utf8');
const requiredCommands = [
  'round15-node1-supreme-court-collector.mjs',
  'round15-node2-circuit-opinion-collector.mjs',
  'round15-node3-bia-precedent-collector.mjs',
  'round15-node4-whitehouse-executive-orders.mjs',
  'round15-node5-federal-register-final-rules.mjs'
];

check(/workflow_dispatch:/.test(workflow), '支持人工立即触发');
check(/schedule:/.test(workflow) && /cron:/.test(workflow), '具备持续定时触发');
check(requiredCommands.every((name) => workflow.includes(name)), '五大官方源均纳入同一同步编排');

const datasets = [
  ['SCOTUS', 'data/legal/supreme-court-latest.json'],
  ['US_CIRCUIT', 'data/legal/circuit-opinions-latest.json'],
  ['BIA', 'data/legal/bia-precedent-latest.json'],
  ['WHITE_HOUSE', 'data/legal/whitehouse-executive-orders-latest.json'],
  ['FEDERAL_REGISTER', 'data/legal/federal-register-final-rules-latest.json']
];

function largestArrayCount(value) {
  if (Array.isArray(value)) return Math.max(value.length, ...value.map(largestArrayCount), 0);
  if (value && typeof value === 'object') return Math.max(0, ...Object.values(value).map(largestArrayCount));
  return 0;
}

const counts = {};
for (const [source, path] of datasets) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const count = largestArrayCount(parsed);
    counts[source] = count;
    check(count > 0, `${source} 同步数据可解析且非空`, `records>=${count}`);
  } catch (error) {
    counts[source] = 0;
    check(false, `${source} 同步数据可解析且非空`, error.message);
  }
}

check(Object.values(counts).every((n) => n > 0), '五大官方源同步链没有空源');

const report = {
  generatedAt: new Date().toISOString(),
  node: 1,
  title: '五大官方法律源自动采集触发链闭环',
  counts,
  checks,
  failures
};
writeFileSync('round16-node1-legal-source-sync-audit.json', JSON.stringify(report, null, 2));
console.log(`ROUND16 NODE1 audit: checks=${checks.length}; failures=${failures}`);
if (failures === 0) console.log('ROUND16 NODE1 PASS: five official legal source collection trigger chain verified');
else {
  console.log('ROUND16 NODE1 FAIL: legal source collection trigger chain gaps remain');
  process.exitCode = 1;
}
