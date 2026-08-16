import { readFileSync, writeFileSync } from 'node:fs';
const dbPath='data/legal/unified-legal-authorities-latest.json';
const aiPath='data/legal/legal-ai-analysis-latest.json';
const db=JSON.parse(readFileSync(dbPath,'utf8'));
const ai=JSON.parse(readFileSync(aiPath,'utf8'));
const records=new Map((db.records||[]).map(r=>[String(r.id),r]));
const kept=[];
const removedOrphans=[];
let changed=0;
for(const a of ai.analyses||[]){
  const r=records.get(String(a.recordId));
  if(!r){
    removedOrphans.push(String(a.recordId));
    continue;
  }
  for(const field of ['sourceSystem','authorityType','issuingBody','officialUrl','title']){
    if(String(a[field]??'')!==String(r[field]??''))throw new Error(`Official metadata mismatch for ${a.recordId} field=${field}`);
  }
  if(String(a.datasetVersion||'')!==String(db.datasetVersion||'')){a.datasetVersion=db.datasetVersion;changed++}
  kept.push(a);
}
ai.analyses=kept;
ai.datasetVersion=db.datasetVersion;
ai.count=kept.length;
writeFileSync(aiPath,JSON.stringify(ai,null,2)+'\n');
console.log(`ROUND 17 NODE 6 VERSION SYNC: changed=${changed}; removedOrphans=${removedOrphans.length}; datasetVersion=${db.datasetVersion}`);
if(removedOrphans.length)console.log(`ROUND 17 NODE 6 ORPHANS REMOVED: ${removedOrphans.join(',')}`);
