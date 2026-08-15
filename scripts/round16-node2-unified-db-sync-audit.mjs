import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const checks=[]; let failures=0;
function check(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`)}
function readJson(path){return JSON.parse(readFileSync(path,'utf8'))}
function sha(value){return createHash('sha256').update(value).digest('hex')}

const unified=readJson('data/legal/unified-legal-authorities-latest.json');
const sourceFiles={
  SCOTUS: readJson('data/legal/supreme-court-latest.json'),
  US_CIRCUIT: readJson('data/legal/circuit-opinions-latest.json'),
  BIA: readJson('data/legal/bia-precedent-latest.json'),
  WHITE_HOUSE: readJson('data/legal/whitehouse-executive-orders-latest.json'),
  FEDERAL_REGISTER: readJson('data/legal/federal-register-final-rules-latest.json')
};

const expectedCounts={
  SCOTUS:(sourceFiles.SCOTUS.records||[]).length,
  US_CIRCUIT:(sourceFiles.US_CIRCUIT.results||[]).reduce((n,c)=>n+(c.documents||[]).length,0),
  BIA:(sourceFiles.BIA.decisions||[]).length,
  WHITE_HOUSE:(sourceFiles.WHITE_HOUSE.orders||[]).length,
  FEDERAL_REGISTER:(sourceFiles.FEDERAL_REGISTER.rules||[]).length
};
const records=Array.isArray(unified.records)?unified.records:[];
const actualCounts={}; for(const r of records) actualCounts[r.sourceSystem]=(actualCounts[r.sourceSystem]||0)+1;
const recomputedVersion=sha(JSON.stringify(records));
const uniqueSourceKeys=new Set(records.map(r=>r.sourceKey));
const uniqueIds=new Set(records.map(r=>r.id));

check(unified.schemaVersion===1,'unified schema version is pinned','schemaVersion='+unified.schemaVersion);
check(Object.keys(actualCounts).length===5,'all five legal source systems represented',JSON.stringify(actualCounts));
for(const [source,count] of Object.entries(expectedCounts)) check(actualCounts[source]===count,`${source} synchronized into unified database`,`source=${count}; unified=${actualCounts[source]||0}`);
check(unified.count===records.length,'unified count metadata matches records',`metadata=${unified.count}; records=${records.length}`);
check(records.length===Object.values(expectedCounts).reduce((a,b)=>a+b,0),'unified database rebuilt from current source snapshots',`expected=${Object.values(expectedCounts).reduce((a,b)=>a+b,0)}; actual=${records.length}`);
check(uniqueSourceKeys.size===records.length,'source keys remain unique',`unique=${uniqueSourceKeys.size}; records=${records.length}`);
check(uniqueIds.size===records.length,'record IDs remain unique',`unique=${uniqueIds.size}; records=${records.length}`);
check(recomputedVersion===unified.datasetVersion,'dataset version matches normalized current records',unified.datasetVersion);
check(unified.versionStrategy?.includes('SHA-256'),'content-addressed version strategy preserved',unified.versionStrategy||'');

const report={generatedAt:new Date().toISOString(),node:'2 统一法律数据库自动重建与版本同步',datasetVersion:unified.datasetVersion,count:records.length,expectedCounts,actualCounts,checks,failures};
writeFileSync('round16-node2-unified-db-sync-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(`ROUND16 NODE2 audit: records=${records.length}; checks=${checks.length}; failures=${failures}; version=${unified.datasetVersion}`);
if(failures===0) console.log('ROUND16 NODE2 PASS: unified legal database rebuild and version synchronization verified');
else { console.log('ROUND16 NODE2 FAIL: unified legal database is stale or version synchronization is inconsistent'); process.exitCode=1; }
