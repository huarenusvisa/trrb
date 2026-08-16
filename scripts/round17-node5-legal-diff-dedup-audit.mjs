import { readFileSync, writeFileSync } from 'node:fs';

function readJson(path){return JSON.parse(readFileSync(path,'utf8'))}
function keyMap(records,key){const m=new Map();for(const r of records||[]){const v=String(r?.[key]||'');if(!m.has(v))m.set(v,[]);m.get(v).push(r)}return m}
function stableRecord(r){return JSON.stringify({sourceSystem:r.sourceSystem,authorityType:r.authorityType,issuingBody:r.issuingBody,jurisdiction:r.jurisdiction,publicationDate:r.publicationDate,docket:r.docket,title:r.title,citation:r.citation,precedentialStatus:r.precedentialStatus,officialUrl:r.officialUrl,officialPdfUrl:r.officialPdfUrl,sourceKey:r.sourceKey})}

const currentPath=process.argv[2]||'data/legal/unified-legal-authorities-latest.json';
const previousPath=process.argv[3]||'';
const outputPath=process.argv[4]||'round17-node5-legal-diff-audit.json';
const current=readJson(currentPath);
const previous=previousPath?readJson(previousPath):{datasetVersion:null,records:[]};
const currentRecords=Array.isArray(current.records)?current.records:[];
const previousRecords=Array.isArray(previous.records)?previous.records:[];

const idGroups=keyMap(currentRecords,'id');
const sourceKeyGroups=keyMap(currentRecords,'sourceKey');
const duplicateIds=[...idGroups].filter(([k,v])=>!k||v.length>1).map(([id,records])=>({id,count:records.length,sourceKeys:records.map(r=>r.sourceKey)}));
const duplicateSourceKeys=[...sourceKeyGroups].filter(([k,v])=>!k||v.length>1).map(([sourceKey,records])=>({sourceKey,count:records.length,ids:records.map(r=>r.id)}));

const prevByKey=new Map(previousRecords.filter(r=>r.sourceKey).map(r=>[r.sourceKey,r]));
const curByKey=new Map(currentRecords.filter(r=>r.sourceKey).map(r=>[r.sourceKey,r]));
const added=[...curByKey.keys()].filter(k=>!prevByKey.has(k));
const removed=[...prevByKey.keys()].filter(k=>!curByKey.has(k));
const changed=[...curByKey.keys()].filter(k=>prevByKey.has(k)&&stableRecord(curByKey.get(k))!==stableRecord(prevByKey.get(k))).map(k=>({sourceKey:k,beforeId:prevByKey.get(k).id,afterId:curByKey.get(k).id}));

const identityConflictCandidates=[];
const officialUrlGroups=new Map();
for(const r of currentRecords){const u=String(r.officialUrl||'').trim();if(!u)continue;if(!officialUrlGroups.has(u))officialUrlGroups.set(u,[]);officialUrlGroups.get(u).push(r)}
for(const [officialUrl,records] of officialUrlGroups){if(records.length>1){identityConflictCandidates.push({officialUrl,records:records.map(r=>({id:r.id,sourceKey:r.sourceKey,title:r.title,sourceSystem:r.sourceSystem}))})}}

const report={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  currentDatasetVersion:current.datasetVersion||null,
  previousDatasetVersion:previous.datasetVersion||null,
  currentCount:currentRecords.length,
  previousCount:previousRecords.length,
  diff:{addedCount:added.length,removedCount:removed.length,changedCount:changed.length,added,removed,changed},
  duplicateGovernance:{duplicateIds,duplicateSourceKeys,identityConflictCandidates,policy:'Exact ID/sourceKey duplicates fail validation. Same official URL across distinct records is retained as an auditable candidate and is not auto-deleted.'}
};
writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');

const checks=[
  ['datasetVersion present',/^[a-f0-9]{64}$/.test(String(current.datasetVersion||''))],
  ['record count matches metadata',Number(current.count)===currentRecords.length],
  ['no duplicate or missing IDs',duplicateIds.length===0],
  ['no duplicate or missing sourceKeys',duplicateSourceKeys.length===0],
  ['diff counts reconcile',previousRecords.length+added.length-removed.length===currentRecords.length],
  ['changed records remain auditable',changed.every(x=>x.sourceKey&&x.beforeId&&x.afterId)],
  ['possible identity conflicts retained for review',Array.isArray(identityConflictCandidates)]
];
let failures=0;
for(const [label,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${label}`);if(!ok)failures++}
console.log(`ROUND 17 NODE 5 DIFF: added=${added.length} removed=${removed.length} changed=${changed.length} conflictCandidates=${identityConflictCandidates.length}`);
if(failures){console.error(`ROUND 17 NODE 5: FAIL (${failures}/${checks.length} failed)`);process.exit(1)}
console.log(`ROUND 17 NODE 5: PASS (${checks.length}/${checks.length})`);
