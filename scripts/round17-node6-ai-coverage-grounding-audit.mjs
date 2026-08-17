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
const legalRecords=Array.isArray(db.records)?db.records:[];
const records=new Map(legalRecords.map(r=>[String(r.id),r]));
const analyses=Array.isArray(ai.analyses)?ai.analyses:[];
const required=['chineseTitle','summary','legalIssue','holdingOrRule','impact','sourceGrounding','disclaimer'];
const analysisIds=analyses.map(a=>String(a.recordId||''));
const uniqueAnalysisIds=new Set(analysisIds);
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
const duplicateRecordIds=analysisIds.length-uniqueAnalysisIds.size;
const missingBindings=legalRecords.filter(r=>!uniqueAnalysisIds.has(String(r.id))).map(r=>String(r.id));
const completeAnalyses=analyses.length-incomplete.length;
const coveragePct=legalRecords.length?Number((uniqueAnalysisIds.size/legalRecords.length*100).toFixed(6)):0;
const completeCoveragePct=legalRecords.length?Number((completeAnalyses/legalRecords.length*100).toFixed(6)):0;
const prohibitedPlaceholders=[
  '中文解析正在生成',
  '中文信息整理尚未生成',
  '中文裁判要旨/规则解析正在生成',
  '中文裁判要旨/规则解析尚未生成'
];
const productionPlaceholderHits=prohibitedPlaceholders.filter(p=>app.includes(p)||detail.includes(p));
const checks=[
  ['AI dataset version matches legal database',String(ai.datasetVersion||'')===String(db.datasetVersion||'')],
  ['AI metadata count matches analyses',Number(ai.count)===analyses.length],
  ['totalAnalyses exactly equals totalLegalRecords',analyses.length===legalRecords.length],
  ['Chinese recordId coverage is exactly N/N',uniqueAnalysisIds.size===legalRecords.length&&coveragePct===100],
  ['complete Chinese coverage is exactly 100 percent',completeCoveragePct===100],
  ['no legal record is missing a Chinese analysis binding',missingBindings.length===0],
  ['every analysis maps to a real legal record',orphans.length===0],
  ['official metadata is copied exactly from source records',metadataMismatch.length===0],
  ['every analysis is bound to current dataset version',badVersion.length===0],
  ['all analyses have complete required fields',incomplete.length===0],
  ['all analyses carry legal-information disclaimer',badDisclaimer.length===0],
  ['analysis record IDs are unique',duplicateRecordIds===0],
  ['commercial editorial material is excluded',commercialLeak.length===0],
  ['BIA scope is not overstated',biaOverclaim.length===0],
  ['production list/detail scripts contain no missing-Chinese placeholder state',productionPlaceholderHits.length===0]
];
const report={schemaVersion:2,generatedAt:new Date().toISOString(),datasetVersion:db.datasetVersion,totalLegalRecords:legalRecords.length,totalAnalyses:analyses.length,completeAnalyses,coveragePct,completeCoveragePct,missingBindings,orphans,metadataMismatch,incomplete,badDisclaimer,badVersion,duplicateRecordIds,commercialLeak,biaOverclaim,productionPlaceholderHits,checks};
writeFileSync(outPath,JSON.stringify(report,null,2)+'\n');
let failures=0;for(const [label,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${label}`);if(!ok)failures++}
console.log(`ROUND 17 NODE 6 COVERAGE: ${uniqueAnalysisIds.size}/${legalRecords.length} (${coveragePct}%), complete=${completeAnalyses}/${legalRecords.length} (${completeCoveragePct}%)`);
console.log(`ROUND 17 NODE 6 STRICT: totalAnalyses=${analyses.length}; totalLegalRecords=${legalRecords.length}; orphans=${orphans.length}; duplicates=${duplicateRecordIds}; metadataMismatch=${metadataMismatch.length}; versionMismatch=${badVersion.length}; missingRequired=${incomplete.length}; missingBindings=${missingBindings.length}; placeholders=${productionPlaceholderHits.length}`);
if(failures){console.error(`ROUND 17 NODE 6: FAIL (${failures}/${checks.length} failed)`);process.exit(1)}
console.log(`ROUND 17 NODE 6: PASS (${checks.length}/${checks.length})`);
