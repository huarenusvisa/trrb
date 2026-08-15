#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const nodes = [
  ['1 搜索引擎抓取与索引入口一致性验收','scripts/round14-node1-crawl-index-entry-audit.mjs'],
  ['2 Canonical / Robots / Noindex 深度治理','scripts/round14-node2-canonical-robots-noindex-audit.mjs'],
  ['3 NewsArticle 结构化数据完整性','scripts/round14-node3-newsarticle-schema-audit.mjs'],
  ['4 内链覆盖与孤岛文章治理','scripts/round14-node4-internal-link-orphan-audit.mjs'],
  ['5 重复内容与薄内容持续清理','scripts/round14-node5-duplicate-thin-content-audit.mjs'],
  ['6 图片 SEO / Alt / Lazy-load 完整性','scripts/round14-node6-image-seo-audit.mjs'],
  ['7 Core Web Vitals 深度性能优化','scripts/round14-node7-core-web-vitals-audit.mjs'],
  ['8 Google / Bing 新文发现与推送链路稳定性','scripts/round14-node8-search-discovery-push-audit.mjs'],
  ['9 安全响应头 / 依赖 / 敏感文件暴露审计','scripts/round14-node9-security-audit.mjs']
];

const results=[];
for (const [name,script] of nodes) {
  console.log(`\n===== ROUND14 FINAL RECHECK: ${name} =====`);
  if (!fs.existsSync(script)) {
    console.error(`Missing audit script: ${script}`);
    results.push({name,script,ok:false,reason:'missing script'});
    break;
  }
  const run=spawnSync(process.execPath,[script],{
    stdio:'inherit',
    env:{...process.env,SITE_ORIGIN:process.env.SITE_ORIGIN||'https://trrb.net'},
    timeout:8*60*1000
  });
  const ok=run.status===0 && !run.error;
  results.push({name,script,ok,status:run.status,error:run.error?.message||''});
  if (!ok) {
    console.error(`ROUND14 FINAL RECHECK FAIL: ${name}`);
    break;
  }
  console.log(`ROUND14 FINAL RECHECK PASS: ${name}`);
}

const passed=results.filter(x=>x.ok).length;
const ok=passed===9 && results.length===9;
fs.writeFileSync('round14-node10-final-production-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),origin:process.env.SITE_ORIGIN||'https://trrb.net',passed,total:9,results,ok},null,2)+'\n');

if (!ok) {
  console.log(`ROUND14 NODE10 FAIL: final production total acceptance stopped at ${passed}/9 prerequisite nodes`);
  process.exit(1);
}
console.log('ROUND14 NODE10 PASS: final production total acceptance verified');
console.log('ROUND 14: 10/10 PASS');
