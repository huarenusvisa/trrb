import { readFileSync } from 'node:fs';
const app=readFileSync(process.argv[2]||'legal/legal-app.js','utf8');
const detail=readFileSync(process.argv[3]||'legal/detail.js','utf8');
const spec=readFileSync('docs/ROUND17-LEGAL-KNOWLEDGE-SEARCH-AND-RELIABILITY.md','utf8');
const checks=[
  ['node8 name fixed',spec.includes('8. 法律栏目生产错误监控、降级与恢复闭环')],
  ['list database HTTP errors are detected',app.includes('if(!dbRes.ok)throw new Error')],
  ['list database failures degrade visibly',app.includes("$('#legal-count').textContent='数据库加载失败'")&&app.includes('暂时无法加载法律数据库')],
  ['AI failure does not block official database list',app.includes('if(aiRes.ok)')],
  ['missing AI falls back to official source guidance',app.includes('请先以官方原文为准')],
  ['detail missing ID is handled',detail.includes('缺少资料ID')],
  ['detail missing record is handled',detail.includes('当前不在数据库中')],
  ['detail database HTTP errors are detected',detail.includes('if(!dbRes.ok)throw new Error')],
  ['detail runtime failures degrade visibly',detail.includes('暂时无法加载资料')],
  ['detail AI failure does not block official record',detail.includes('if(aiRes.ok)')],
  ['official source actions remain independent',detail.includes('data-official-primary="true"')]
];
let failures=0;for(const [label,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${label}`);if(!ok)failures++}
if(failures){console.error(`ROUND 17 NODE 8: FAIL (${failures}/${checks.length} failed)`);process.exit(1)}
console.log(`ROUND 17 NODE 8: PASS (${checks.length}/${checks.length})`);
