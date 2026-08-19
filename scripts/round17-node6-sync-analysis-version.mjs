import { readFileSync } from 'node:fs';

const dbPath='data/legal/unified-legal-authorities-latest.json';
const aiPath='data/legal/legal-ai-analysis-latest.json';
const db=JSON.parse(readFileSync(dbPath,'utf8'));
const ai=JSON.parse(readFileSync(aiPath,'utf8'));
const records=new Map((db.records||[]).map(r=>[String(r.id),r]));
const analyses=Array.isArray(ai.analyses)?ai.analyses:[];
const required=['chineseTitle','summary','legalIssue','holdingOrRule','impact','sourceGrounding','disclaimer'];
const orphans=[];
const metadataMismatch=[];
const versionMismatch=[];
const incomplete=[];

for(const a of analyses){
  const id=String(a.recordId||'');
  const r=records.get(id);
  if(!r){orphans.push(id);continue;}
  for(const field of ['sourceSystem','authorityType','issuingBody','officialUrl','officialPdfUrl','title','publicationDate','docket','citation','precedentialStatus','sourceKey']){
    if(String(a[field]??'')!==String(r[field]??'')){
      // Older analyses may not carry every optional record field. Only treat a
      // missing optional binding as a mismatch when the analysis explicitly
      // contains that field; the core copied metadata below is always strict.
      const core=['sourceSystem','authorityType','issuingBody','officialUrl','title'].includes(field);
      const analysisHas=Object.prototype.hasOwnProperty.call(a,field);
      if(core||analysisHas) metadataMismatch.push(`${id}:${field}`);
    }
  }
  if(String(a.datasetVersion||'')!==String(db.datasetVersion||'')) versionMismatch.push(id);
  if(required.some(k=>!String(a[k]||'').trim())||!String(a.disclaimer||'').includes('不构成法律意见')) incomplete.push(id);
}

const ids=new Set(analyses.map(a=>String(a.recordId||'')));
const missing=[...records.keys()].filter(id=>!ids.has(id));
const countMismatch=analyses.length!==(db.records||[]).length||Number(ai.count)!==analyses.length;
const rootVersionMismatch=String(ai.datasetVersion||'')!==String(db.datasetVersion||'');

console.log(`ROUND 17 NODE 6 SAFE VERSION AUDIT: db=${records.size}; ai=${analyses.length}; dbVersion=${db.datasetVersion||'missing'}; aiVersion=${ai.datasetVersion||'missing'}; missing=${missing.length}; orphans=${orphans.length}; metadataMismatch=${metadataMismatch.length}; versionMismatch=${versionMismatch.length}; incomplete=${incomplete.length}`);

if(rootVersionMismatch||versionMismatch.length||missing.length||orphans.length||metadataMismatch.length||incomplete.length||countMismatch){
  console.error('AI legal analyses are not safely synchronized with the current official database. Do not mutate datasetVersion metadata to hide this state; regenerate/re-ground the affected analyses instead.');
  process.exit(1);
}

console.log('ROUND 17 NODE 6 SAFE VERSION AUDIT: PASS — no metadata mutation required or permitted.');
