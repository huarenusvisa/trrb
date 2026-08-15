import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const nodes=[
  ['1 美国最高法院判决自动采集','node',['scripts/round15-node1-supreme-court-collector.mjs','--write-data']],
  ['2 13个联邦巡回上诉法院判决自动采集','node',['scripts/round15-node2-circuit-opinion-collector.mjs']],
  ['3 BIA先例裁决自动采集','node',['scripts/round15-node3-bia-precedent-collector.mjs']],
  ['4 白宫行政命令自动采集','node',['scripts/round15-node4-whitehouse-executive-orders.mjs']],
  ['5 Federal Register新规 / Final Rule自动采集','node',['scripts/round15-node5-federal-register-final-rules.mjs']],
  ['6 判例与新规统一数据库、去重及版本控制','node',['scripts/round15-node6-unified-legal-database.mjs']],
  ['7 AI中文裁判要旨、法律问题与影响范围解析','node',['scripts/round15-node7-ai-legal-analysis.mjs']],
  ['8 “美国判例与新规”前台栏目及检索筛选系统','node',['scripts/round15-node8-legal-frontend-audit.mjs']],
  ['9 重大裁决自动识别并进入唐人日报新闻生产线','node',['scripts/round15-node9-major-legal-news-pipeline.mjs']]
];
const results=[];let failures=0;
for(const [name,cmd,args] of nodes){
  console.log(`\n===== ROUND15 FINAL RECHECK: ${name} =====`);
  const run=spawnSync(cmd,args,{encoding:'utf8',env:{...process.env,ROUND15_AI_BATCH:process.env.ROUND15_FINAL_AI_BATCH||'3'},timeout:12*60*1000,maxBuffer:20*1024*1024});
  if(run.stdout)process.stdout.write(run.stdout);
  if(run.stderr)process.stderr.write(run.stderr);
  const ok=run.status===0 && !run.error;
  results.push({name,ok,status:run.status,error:run.error?.message||null});
  if(ok) console.log(`ROUND15 FINAL RECHECK PASS: ${name}`);
  else {failures++;console.log(`ROUND15 FINAL RECHECK FAIL: ${name} — status=${run.status} error=${run.error?.message||'-'}`);break;}
}
const report={generatedAt:new Date().toISOString(),origin:process.env.SITE_ORIGIN||'https://trrb.net',results,failures,passed:results.filter(r=>r.ok).length};
writeFileSync('round15-node10-final-production-audit.json',JSON.stringify(report,null,2)+'\n');
if(failures===0&&results.length===9&&results.every(r=>r.ok)){
  console.log('ROUND15 NODE10 PASS: final end-to-end production acceptance verified');
  console.log('ROUND 15: 10/10 PASS');
}else{
  console.log(`ROUND15 NODE10 FAIL: final production acceptance incomplete — passed=${report.passed}/9; failures=${failures}`);
  process.exitCode=1;
}
