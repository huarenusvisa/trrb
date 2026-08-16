import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const nodes = [
  ['1 五大官方法律源自动采集触发链闭环','node',['scripts/round16-node1-legal-source-sync-audit.mjs']],
  ['2 统一法律数据库自动重建与版本同步','node',['scripts/round16-node2-unified-db-sync-audit.mjs']],
  ['3 AI中文解析增量更新与事实约束','node',['scripts/round16-node3-ai-incremental-grounding-audit.mjs']],
  ['4 首页“美国判例与新规”生产上线与缓存治理','node',['scripts/round16-node4-home-legal-production.mjs']],
  ['5 五大类深链接筛选与状态保持','node',['scripts/round16-node5-deep-link-state.mjs']],
  ['6 13个联邦巡回法院二级导航与独立筛选','node',['scripts/round16-node6-circuit-nav.mjs']],
  ['7 单条判例/新规详情页与官方原文双层展示','node',['scripts/round16-node7-legal-detail.mjs']],
  ['8 重大裁决/新规新闻路由去重与编辑隔离','node',['scripts/round16-node8-editorial-isolation.mjs']],
  ['9 法律栏目SEO、Sitemap与结构化数据完整性','node',['scripts/round16-node9-legal-seo-sitemap-schema.mjs']]
];
const fixedNames = [
  '1 五大官方法律源自动采集触发链闭环',
  '2 统一法律数据库自动重建与版本同步',
  '3 AI中文解析增量更新与事实约束',
  '4 首页“美国判例与新规”生产上线与缓存治理',
  '5 五大类深链接筛选与状态保持',
  '6 13个联邦巡回法院二级导航与独立筛选',
  '7 单条判例/新规详情页与官方原文双层展示',
  '8 重大裁决/新规新闻路由去重与编辑隔离',
  '9 法律栏目SEO、Sitemap与结构化数据完整性'
];
if(nodes.length!==9 || nodes.some((n,i)=>n[0]!==fixedNames[i])){
  console.error('ROUND16 NODE10 FAIL: fixed node names/order changed');
  process.exit(1);
}
console.log('ROUND16 NODE10 PREFLIGHT PASS: fixed node order preserved');
const results=[]; let failures=0;
for(const [name,cmd,args] of nodes){
  console.log(`\n===== ROUND16 FINAL RECHECK: ${name} =====`);
  const run=spawnSync(cmd,args,{encoding:'utf8',env:{...process.env,SITE_ORIGIN:process.env.SITE_ORIGIN||'https://trrb.net'},timeout:20*60*1000,maxBuffer:30*1024*1024});
  if(run.stdout)process.stdout.write(run.stdout);
  if(run.stderr)process.stderr.write(run.stderr);
  const ok=run.status===0 && !run.error;
  results.push({name,ok,status:run.status,error:run.error?.message||null});
  if(ok) console.log(`ROUND16 FINAL RECHECK PASS: ${name}`);
  else { failures++; console.log(`ROUND16 FINAL RECHECK FAIL: ${name} — status=${run.status} error=${run.error?.message||'-'}`); break; }
}
const report={generatedAt:new Date().toISOString(),origin:process.env.SITE_ORIGIN||'https://trrb.net',results,failures,passed:results.filter(r=>r.ok).length};
writeFileSync('round16-node10-final-production-audit.json',JSON.stringify(report,null,2)+'\n');
if(failures===0&&results.length===9&&results.every(r=>r.ok)){
  console.log('ROUND16 NODE10 PASS: final end-to-end production acceptance verified');
  console.log('ROUND 16: 10/10 PASS');
}else{
  console.log(`ROUND16 NODE10 FAIL: final production acceptance incomplete — passed=${report.passed}/9; failures=${failures}`);
  process.exitCode=1;
}
