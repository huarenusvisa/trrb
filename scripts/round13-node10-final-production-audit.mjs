#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const nodes = [
  ['1 最新文章发布实时性验收', 'scripts/round13-publish-freshness-audit.mjs'],
  ['2 首页 / 栏目 / 专题实时同步', 'scripts/round13-node2-live-listings.mjs'],
  ['3 Sitemap / RSS 自动更新零延迟治理', 'scripts/round13-node3-seo-realtime-audit.mjs'],
  ['4 站内搜索新文章即时可搜', 'scripts/round13-node4-search-freshness-audit.mjs'],
  ['5 发布失败与异常文章自动拦截', 'scripts/round13-node5-publish-guard-audit.mjs'],
  ['6 图片上传与封面自动容灾', 'scripts/round13-node6-image-resilience-audit.mjs'],
  ['7 Netlify 构建与部署稳定性', 'scripts/round13-node7-netlify-stability-audit.mjs'],
  ['8 移动端首屏速度与交互性能', 'scripts/round13-node8-mobile-performance-audit.mjs'],
  ['9 全站404 / 5xx / 资源错误持续审计', 'scripts/round13-node9-error-audit.mjs']
];

const results=[];
for (const [name, script] of nodes) {
  if (!fs.existsSync(script)) {
    console.error(`ROUND13 NODE10 FAIL: missing ${script}`);
    results.push({name,script,ok:false,reason:'missing script'});
    continue;
  }
  console.log(`\n===== ROUND13 FINAL RECHECK: ${name} =====`);
  const run=spawnSync(process.execPath,[script],{
    encoding:'utf8',
    env:{...process.env,SITE_ORIGIN:process.env.SITE_ORIGIN||'https://trrb.net'},
    maxBuffer:64*1024*1024
  });
  if(run.stdout)process.stdout.write(run.stdout);
  if(run.stderr)process.stderr.write(run.stderr);
  const ok=run.status===0;
  results.push({name,script,ok,exit_code:run.status});
  if(!ok)console.error(`ROUND13 FINAL NODE FAIL: ${name} exit=${run.status}`);
}

const passed=results.filter(x=>x.ok).length;
const report={generated_at:new Date().toISOString(),origin:process.env.SITE_ORIGIN||'https://trrb.net',passed,total:9,results};
fs.writeFileSync('round13-node10-final-production-audit.json',JSON.stringify(report,null,2)+'\n');

if(passed!==9){
  console.error(`ROUND13 NODE10 FAIL: prerequisite nodes passed ${passed}/9`);
  process.exit(1);
}
console.log('ROUND13 NODE10 PASS: final production total acceptance verified');
console.log('ROUND 13: 10/10 PASS');
