import fs from 'node:fs';

const appPath='legal/legal-app.js';
const dbPath='data/legal/unified-legal-authorities-latest.json';
const aiPath='data/legal/legal-ai-analysis-latest.json';
const app=fs.readFileSync(appPath,'utf8');
const db=JSON.parse(fs.readFileSync(dbPath,'utf8'));
const ai=JSON.parse(fs.readFileSync(aiPath,'utf8'));
const spec='docs/ROUND17-LEGAL-KNOWLEDGE-SEARCH-AND-RELIABILITY.md';
const specText=fs.readFileSync(spec,'utf8');

const records=Array.isArray(db.records)?db.records:[];
const analyses=Array.isArray(ai.analyses)?ai.analyses:[];
const recordIds=new Set(records.map(r=>String(r.id)));
const analysisIds=analyses.map(a=>String(a.recordId||''));
const uniqueAnalysisIds=new Set(analysisIds);
const requiredSearchFields=['chineseTitle','summary','legalIssue','holdingOrRule','impact'];
const missingBindings=records.filter(r=>!uniqueAnalysisIds.has(String(r.id))).map(r=>String(r.id));
const orphans=analyses.filter(a=>!recordIds.has(String(a.recordId||''))).map(a=>String(a.recordId||''));
const incomplete=analyses.filter(a=>requiredSearchFields.some(k=>!String(a[k]||'').trim())).map(a=>String(a.recordId||''));
const duplicateRecordIds=analysisIds.length-uniqueAnalysisIds.size;
const coveragePct=records.length?Number((uniqueAnalysisIds.size/records.length*100).toFixed(6)):0;

const checks=[
  ['spec fixes node1 name', specText.includes('1. 法律站内搜索中文解析覆盖与相关性排序')],
  ['strict spec requires N/N 100 percent Chinese coverage', specText.includes('N/N = 100%')],
  ['Chinese analysis count exactly matches legal records', analyses.length===records.length],
  ['Chinese recordId coverage exactly matches legal records', uniqueAnalysisIds.size===records.length&&coveragePct===100],
  ['no legal record is missing a Chinese analysis binding', missingBindings.length===0],
  ['no orphan Chinese analyses exist', orphans.length===0],
  ['no duplicate Chinese analysis recordId exists', duplicateRecordIds===0],
  ['all searchable Chinese analysis fields are complete', incomplete.length===0],
  ['analysis dataset version matches unified legal dataset', String(ai.datasetVersion||'')===String(db.datasetVersion||'')],
  ['search includes Chinese analysis title', app.includes('a.chineseTitle')],
  ['search includes Chinese summary', app.includes('a.summary')],
  ['search includes Chinese legal issue', app.includes('a.legalIssue')],
  ['search includes Chinese holding/rule', app.includes('a.holdingOrRule')],
  ['search includes Chinese impact', app.includes('a.impact')],
  ['official exact title ranking exists', app.includes('title===query')],
  ['docket exact ranking exceeds title exact ranking', app.includes('docket===query') && app.includes('score+=160')],
  ['citation exact ranking exists', app.includes('citation===query')],
  ['empty query retains default date sort', app.includes("sort:(params.get('sort')||'relevance').trim()") && app.includes("if(state.sort==='newest'||!state.q)return defaultSorted(scoped)")],
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

console.log(`ROUND 17 NODE 1 DATA: legal=${records.length}; analyses=${analyses.length}; uniqueBindings=${uniqueAnalysisIds.size}; coveragePct=${coveragePct}; missing=${missingBindings.length}; orphans=${orphans.length}; duplicates=${duplicateRecordIds}; incomplete=${incomplete.length}`);
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
