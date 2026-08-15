import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const checks=[]; let failures=0;
function check(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`)}
function readJson(path){return JSON.parse(readFileSync(path,'utf8'))}
function sha(value){return createHash('sha256').update(value).digest('hex')}
function canonicalUrl(url=''){try{const u=new URL(url);u.hash='';return u.toString()}catch{return url||''}}
function id(parts){return sha(parts.filter(Boolean).join('|')).slice(0,24)}

const scotus=readJson('data/legal/supreme-court-latest.json');
const circuits=readJson('data/legal/circuit-opinions-latest.json');
const bia=readJson('data/legal/bia-precedent-latest.json');
const whitehouse=readJson('data/legal/whitehouse-executive-orders-latest.json');
const federalRegister=readJson('data/legal/federal-register-final-rules-latest.json');

const records=[];
for(const r of scotus.records||[]){
  records.push({
    id:id(['scotus',r.docket,r.publicationDate,r.caseName]),
    sourceSystem:'SCOTUS',authorityType:'Supreme Court Opinion',issuingBody:r.issuingBody||'Supreme Court of the United States',
    jurisdiction:'United States',publicationDate:r.publicationDate||null,docket:r.docket||null,title:r.caseName||null,
    citation:r.officialCitation||null,precedentialStatus:r.precedentialStatus||'opinion_of_the_court',
    officialUrl:canonicalUrl(r.officialPdfUrl||r.officialUrl),officialPdfUrl:canonicalUrl(r.officialPdfUrl||r.officialUrl),
    sourceKey:`SCOTUS:${r.docket||''}:${r.publicationDate||''}`
  });
}
for(const court of circuits.results||[]){
  for(const d of court.documents||[]){
    const url=canonicalUrl(d.url);
    records.push({
      id:id(['circuit',court.courtId,url]),sourceSystem:'US_CIRCUIT',authorityType:'Federal Appellate Opinion',
      issuingBody:court.courtName||court.courtId,jurisdiction:'United States',publicationDate:null,docket:null,title:d.title||null,
      citation:null,precedentialStatus:'unknown',officialUrl:url,officialPdfUrl:/\.pdf(?:$|[?#])/i.test(url)?url:null,
      sourceKey:`CIRCUIT:${court.courtId}:${sha(url).slice(0,16)}`
    });
  }
}
for(const r of bia.decisions||[]){
  const url=canonicalUrl(r.officialPdfUrl);
  records.push({
    id:id(['bia',String(r.volume),String(r.reporterPage)]),sourceSystem:'BIA',authorityType:'BIA Precedent Decision',
    issuingBody:'Board of Immigration Appeals',jurisdiction:'United States',publicationDate:null,docket:null,title:r.caseName||null,
    citation:r.citation||null,precedentialStatus:'precedential',officialUrl:url,officialPdfUrl:url,
    sourceKey:`BIA:${r.volume||''}:${r.reporterPage||''}`
  });
}
for(const r of whitehouse.orders||[]){
  const url=canonicalUrl(r.officialUrl);
  records.push({
    id:id(['eo',String(r.executiveOrderNumber)]),sourceSystem:'WHITE_HOUSE',authorityType:'Executive Order',
    issuingBody:r.issuer||'President of the United States',jurisdiction:'United States',publicationDate:r.date||null,docket:null,title:r.title||null,
    citation:`Executive Order ${r.executiveOrderNumber}`,precedentialStatus:'executive_action',officialUrl:url,officialPdfUrl:null,
    sourceKey:`EO:${r.executiveOrderNumber}`
  });
}
for(const r of federalRegister.rules||[]){
  const url=canonicalUrl(r.htmlUrl||r.officialPdfUrl);
  records.push({
    id:id(['fr',r.documentNumber]),sourceSystem:'FEDERAL_REGISTER',authorityType:'Federal Register Final Rule',
    issuingBody:(r.agencies||[]).map(a=>a.name).filter(Boolean).join('; ')||'Federal Agency',jurisdiction:'United States',
    publicationDate:r.publicationDate||null,docket:null,title:r.title||null,citation:r.citation||null,precedentialStatus:'final_rule',
    officialUrl:url,officialPdfUrl:canonicalUrl(r.officialPdfUrl||'' )||null,sourceKey:`FR:${r.documentNumber}`
  });
}

const sourceCounts={}; for(const r of records) sourceCounts[r.sourceSystem]=(sourceCounts[r.sourceSystem]||0)+1;
const bySourceKey=new Map(); let duplicateSourceKeys=0;
for(const r of records){if(bySourceKey.has(r.sourceKey)){duplicateSourceKeys++;continue;}bySourceKey.set(r.sourceKey,r)}
const deduped=[...bySourceKey.values()].sort((a,b)=>a.sourceSystem.localeCompare(b.sourceSystem)||a.sourceKey.localeCompare(b.sourceKey));
const duplicateIds=deduped.length-new Set(deduped.map(r=>r.id)).size;
const missingCore=deduped.filter(r=>!r.id||!r.sourceSystem||!r.authorityType||!r.issuingBody||!r.sourceKey||!r.officialUrl);
const canonicalPayload=deduped.map(({id,...r})=>({id,...r}));
const datasetVersion=sha(JSON.stringify(canonicalPayload));

check((scotus.records||[]).length>0,'SCOTUS dataset loaded',`records=${(scotus.records||[]).length}`);
check((circuits.results||[]).length===13,'13 federal appellate court datasets loaded',`courts=${(circuits.results||[]).length}`);
check((bia.decisions||[]).length>0,'BIA precedent dataset loaded',`records=${(bia.decisions||[]).length}`);
check((whitehouse.orders||[]).length>0,'White House executive-order dataset loaded',`records=${(whitehouse.orders||[]).length}`);
check((federalRegister.rules||[]).length>0,'Federal Register final-rule dataset loaded',`records=${(federalRegister.rules||[]).length}`);
check(duplicateSourceKeys===0,'unified source keys are unique',`duplicates=${duplicateSourceKeys}`);
check(duplicateIds===0,'unified record IDs are unique',`duplicates=${duplicateIds}`);
check(missingCore.length===0,'unified core fields complete',`missing=${missingCore.length}`);
check(/^[a-f0-9]{64}$/.test(datasetVersion),'content-addressed dataset version generated',datasetVersion.slice(0,16));
check(Object.keys(sourceCounts).length===5,'all five legal authority source systems represented',JSON.stringify(sourceCounts));

const output={schemaVersion:1,datasetVersion,versionStrategy:'SHA-256 over normalized deduplicated records; identical legal content produces identical version.',scope:'TRRB U.S. judiciary and regulatory database. Database records remain separate from ordinary news articles.',sourceCounts,count:deduped.length,records:deduped};
writeFileSync('data/legal/unified-legal-authorities-latest.json',JSON.stringify(output,null,2)+'\n');
writeFileSync('round15-node6-unified-legal-database-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),schemaVersion:1,datasetVersion,count:deduped.length,sourceCounts,checks,failures},null,2)+'\n');
console.log(`ROUND15 NODE6 audit: records=${deduped.length}; checks=${checks.length}; failures=${failures}; version=${datasetVersion}`);
if(failures===0)console.log('ROUND15 NODE6 PASS: unified legal database, deduplication and version control verified');else{console.log('ROUND15 NODE6 FAIL: unified legal database governance gaps remain');process.exitCode=1}
