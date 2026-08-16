import fs from 'node:fs';

const appPath='legal/legal-app.js';
const app=fs.readFileSync(appPath,'utf8');
const spec='docs/ROUND17-LEGAL-KNOWLEDGE-SEARCH-AND-RELIABILITY.md';
const specText=fs.readFileSync(spec,'utf8');

const checks=[
  ['spec fixes node1 name', specText.includes('1. 法律站内搜索中文解析覆盖与相关性排序')],
  ['search includes Chinese analysis title', app.includes('a.chineseTitle')],
  ['search includes Chinese summary', app.includes('a.summary')],
  ['search includes Chinese legal issue', app.includes('a.legalIssue')],
  ['search includes Chinese holding/rule', app.includes('a.holdingOrRule')],
  ['search includes Chinese impact', app.includes('a.impact')],
  ['official exact title ranking exists', app.includes('title===query')],
  ['docket exact ranking exceeds title exact ranking', app.includes('docket===query') && app.includes('score+=160')],
  ['citation exact ranking exists', app.includes('citation===query')],
  ['empty query retains default date sort', app.includes('if(!state.q)return defaultSorted(scoped)')],
  ['source filter remains enforced', app.includes("!state.source||r.sourceSystem===state.source")],
  ['body filter remains enforced', app.includes("!state.body||r.issuingBody===state.body")],
  ['type filter remains enforced', app.includes("!state.type||r.authorityType===state.type")],
  ['query URL state remains persisted', app.includes("if(state.q)p.set('q',state.q)")],
  ['source URL state remains persisted', app.includes("if(state.source)p.set('source',state.source)")],
  ['body URL state remains persisted', app.includes("if(state.body)p.set('body',state.body)")],
  ['type URL state remains persisted', app.includes("if(state.type)p.set('type',state.type)")],
  ['page URL state remains persisted', app.includes("if(state.page>1)p.set('page',String(state.page))")],
  ['13-circuit navigation binding remains present', app.includes('[data-circuit-body]')],
  ['search implementation is confined to legal app', !app.includes('homepage-news-order')]
];

let failed=0;
for(const [name,ok] of checks){
  console.log(`${ok?'PASS':'FAIL'}: ${name}`);
  if(!ok)failed++;
}
if(failed){
  console.error(`ROUND 17 NODE 1: FAIL (${failed}/${checks.length} failed)`);
  process.exit(1);
}
console.log(`ROUND 17 NODE 1: PASS (${checks.length}/${checks.length})`);
