import { readFileSync, writeFileSync } from 'node:fs';

const dbPath=process.argv[2]||'data/legal/unified-legal-authorities-latest.json';
const aiPath=process.argv[3]||'data/legal/legal-ai-analysis-latest.json';
const appPath=process.argv[4]||'legal/legal-app.js';
const detailPath=process.argv[5]||'legal/detail.js';
const outPath=process.argv[6]||'round17-node6-ai-coverage-audit.json';
const db=JSON.parse(readFileSync(dbPath,'utf8'));
const ai=JSON.parse(readFileSync(aiPath,'utf8'));
const app=readFileSync(appPath,'utf8');
const detail=readFileSync(detailPath,'utf8');
const records=new Map((db.records||[]).map(r=>[String(r.id),r]));
const analyses=Array.isArray(ai.analyses)?ai.analyses:[];
const required=['chineseTitle','summary','legalIssue','holdingOrRule','impact','sourceGrounding','disclaimer'];
const orphans=[];const metadataMismatch=[];const incomplete=[];const badDisclaimer=[];const badVersion=[];const commercialLeak=[];const biaOverclaim=[];
for(const a of analyses){
  const r=records.get(String(a.recordId));
  if(!r){orphans.push(a.recordId);continue}
  const same=(field)=>String(a[field]??'')===String(r[field]??'');
  if(!['sourceSystem','authorityType','issuingBody','officialUrl','title'].every(same))metadataMismatch.push(a.recordId);
  if(required.some(k=>!String(a[k]||'').trim()))incomplete.push(a.recordId);
  if(!String(a.disclaimer||'').includes('不构成法律意见'))badDisclaimer.push(a.recordId);
  if(String(a.datasetVersion||'')!==String(db.datasetVersion||''))badVersion.push(a.recordId);
  const generated=[a.chineseTitle,a.summary,a.legalIssue,a.holdingOrRule,a.impact,a.sourceGrounding].join(' ');
  if(/\b(westlaw|lexis|headnote)\b/i.test(generated))commercialLeak.push(a.recordId);
  if(a.sourceSystem==='BIA'&&/(全部裁决|所有裁决|all decisions)/i.test(generated))biaOverclaim.push(a.recordId);
}
const duplicateRecordIds=analyses.length-new Set(analyses.map(a=>String(a.recordId))).size;
const completeAnalyses=analyses.length-incomplete.length;
const coveragePct=(db.records||[]).length?Number((analyses.length/(db.records||[]).length*100).toFixed(2)):0;
const completeCoveragePct=(db.records||[]).length?Number((completeAnalyses/(db.records||[]).length*100).toFixed(2)):0;
const checks=[
  ['AI dataset version matches legal database',String(ai.datasetVersion||'')===String(db.datasetVersion||'')],
  ['AI metadata count matches analyses',Number(ai.count)===analyses.length],
  ['every analysis maps to a real legal record',orphans.length===0],
  ['official metadata is copied exactly from source records',metadataMismatch.length===0],
  ['every analysis is bound to current dataset version',badVersion.length===0],
  ['all existing analyses have complete required fields',incomplete.length===0],
  ['all analyses carry legal-information disclaimer',badDisclaimer.length===0],
  ['analysis record IDs are unique',duplicateRecordIds===0],
  ['commercial editorial material is excluded',commercialLeak.length===0],
  ['BIA scope is not overstated',biaOverclaim.length===0],
  ['coverage rate is explicitly measurable',coveragePct>0&&coveragePct<=100],
  ['list page has missing-analysis official-source fallback',app.includes('中文裁判要旨/规则解析正在生成；请先以官方原文为准。')],
  ['detail page has missing-analysis official-source fallback',detail.includes('中文裁判要旨/规则解析尚未生成')&&detail.includes('请先以官方原文为准')]
];
const report={schemaVersion:1,generatedAt:new Date().toISOString(),datasetVersion:db.datasetVersion,totalLegalRecords:(db.records||[]).length,totalAnalyses:analyses.length,completeAnalyses,coveragePct,completeCoveragePct,orphans,metadataMismatch,incomplete,badDisclaimer,badVersion,duplicateRecordIds,commercialLeak,biaOverclaim,checks};
writeFileSync(outPath,JSON.stringify(report,null,2)+'\n');
let failures=0;for(const [label,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${label}`);if(!ok)failures++}
console.log(`ROUND 17 NODE 6 COVERAGE: ${analyses.length}/${(db.records||[]).length} (${coveragePct}%), complete=${completeAnalyses}/${(db.records||[]).length} (${completeCoveragePct}%)`);
if(failures){console.error(`ROUND 17 NODE 6: FAIL (${failures}/${checks.length} failed)`);process.exit(1)}
console.log(`ROUND 17 NODE 6: PASS (${checks.length}/${checks.length})`);
