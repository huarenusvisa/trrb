import { readFileSync, writeFileSync } from 'node:fs';

const checks=[]; let failures=0;
function check(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`)}
const db=JSON.parse(readFileSync('data/legal/unified-legal-authorities-latest.json','utf8'));
const ai=JSON.parse(readFileSync('data/legal/legal-ai-analysis-latest.json','utf8'));
const records=new Map((db.records||[]).map(r=>[r.id,r]));
const analyses=Array.isArray(ai.analyses)?ai.analyses:[];
const required=['chineseTitle','summary','legalIssue','holdingOrRule','impact','sourceGrounding','disclaimer'];
const orphan=analyses.filter(a=>!records.has(a.recordId));
const urlMismatch=analyses.filter(a=>records.has(a.recordId)&&String(a.officialUrl||'')!==String(records.get(a.recordId).officialUrl||''));
const incomplete=analyses.filter(a=>required.some(k=>!String(a[k]||'').trim()));
const disclaimerBad=analyses.filter(a=>!String(a.disclaimer||'').includes('不构成法律意见'));
const commercialLeak=analyses.filter(a=>/(westlaw|lexis|headnote)/i.test([a.chineseTitle,a.summary,a.legalIssue,a.holdingOrRule,a.impact,a.sourceGrounding].join(' ')));
const biaOverclaim=analyses.filter(a=>a.sourceSystem==='BIA'&&/(全部裁决|所有裁决|all decisions)/i.test([a.summary,a.legalIssue,a.holdingOrRule,a.impact].join(' ')));
const authorityMismatch=analyses.filter(a=>{const r=records.get(a.recordId);return r&&(a.sourceSystem!==r.sourceSystem||a.authorityType!==r.authorityType||a.issuingBody!==r.issuingBody)});
const duplicateIds=analyses.length-new Set(analyses.map(a=>a.recordId)).size;
const currentVersionAnalyses=analyses.filter(a=>a.datasetVersion===db.datasetVersion).length;

check(ai.datasetVersion===db.datasetVersion,'AI dataset pointer synchronized to unified database',`ai=${ai.datasetVersion}; db=${db.datasetVersion}`);
check(ai.count===analyses.length,'AI count metadata matches analyses',`metadata=${ai.count}; analyses=${analyses.length}`);
check(analyses.length>0,'incremental AI analysis corpus is non-empty',`analyses=${analyses.length}`);
check(orphan.length===0,'all AI analyses map to current legal records',`orphans=${orphan.length}`);
check(urlMismatch.length===0,'official source URLs remain bound to source records',`mismatches=${urlMismatch.length}`);
check(authorityMismatch.length===0,'authority metadata is preserved from unified records',`mismatches=${authorityMismatch.length}`);
check(incomplete.length===0,'required Chinese analysis fields are complete',`incomplete=${incomplete.length}`);
check(disclaimerBad.length===0,'all analyses include legal-information disclaimer',`bad=${disclaimerBad.length}`);
check(commercialLeak.length===0,'no Westlaw/Lexis/headnote material appears in generated analysis',`hits=${commercialLeak.length}`);
check(biaOverclaim.length===0,'BIA scope is not overstated as all decisions',`hits=${biaOverclaim.length}`);
check(duplicateIds===0,'incremental analysis does not duplicate record IDs',`duplicates=${duplicateIds}`);
check(currentVersionAnalyses>0,'current dataset produced or refreshed incremental analyses',`currentVersion=${currentVersionAnalyses}/${analyses.length}`);
check(String(ai.scope||'').includes('first-party official source'),'AI scope explicitly requires first-party official grounding',ai.scope||'');

const report={generatedAt:new Date().toISOString(),node:'3 AI中文解析增量更新与事实约束',datasetVersion:db.datasetVersion,count:analyses.length,currentVersionAnalyses,orphan:orphan.length,urlMismatch:urlMismatch.length,authorityMismatch:authorityMismatch.length,incomplete:incomplete.length,disclaimerBad:disclaimerBad.length,commercialLeak:commercialLeak.length,biaOverclaim:biaOverclaim.length,duplicateIds,checks,failures};
writeFileSync('round16-node3-ai-incremental-grounding-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(`ROUND16 NODE3 audit: analyses=${analyses.length}; currentVersion=${currentVersionAnalyses}; checks=${checks.length}; failures=${failures}`);
if(failures===0) console.log('ROUND16 NODE3 PASS: incremental Chinese legal analysis and first-party fact constraints verified');
else { console.log('ROUND16 NODE3 FAIL: AI incremental update or grounding constraints are inconsistent'); process.exitCode=1; }
