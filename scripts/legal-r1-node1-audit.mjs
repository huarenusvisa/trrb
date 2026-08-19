import fs from 'node:fs';
import crypto from 'node:crypto';

const file='data/legal/unified-legal-authorities-latest.json';
const db=JSON.parse(fs.readFileSync(file,'utf8'));
const records=Array.isArray(db.records)?db.records:[];
const sourceCounts={};
const errors=[];
const seen=new Set();
let pdfCandidates=0, htmlCandidates=0, fullTextEligibleCount=0;
const inventory=[];
for (const r of records) {
  const recordId=String(r.id||r.recordId||'').trim();
  if(!recordId) errors.push({type:'empty_record_id'});
  else if(seen.has(recordId)) errors.push({type:'duplicate_record_id',recordId});
  else seen.add(recordId);
  const sourceSystem=String(r.sourceSystem||'').trim();
  sourceCounts[sourceSystem||'UNKNOWN']=(sourceCounts[sourceSystem||'UNKNOWN']||0)+1;
  const officialUrl=String(r.officialUrl||'').trim();
  const officialPdfUrl=String(r.officialPdfUrl||'').trim();
  if(!sourceSystem) errors.push({type:'missing_source_system',recordId});
  if(!officialUrl && !officialPdfUrl) errors.push({type:'missing_official_source',recordId});
  const pdf=!!officialPdfUrl || /\.pdf(?:$|[?#])/i.test(officialUrl) || /\/dl\?inline/i.test(officialUrl);
  const html=!!officialUrl && !pdf;
  if(pdf) pdfCandidates++;
  if(html) htmlCandidates++;
  const eligible=pdf||html;
  if(eligible) fullTextEligibleCount++;
  inventory.push({recordId,sourceSystem,officialUrl:officialUrl||null,officialPdfUrl:officialPdfUrl||null,fullTextAvailable:eligible,sourceFormat:pdf?'pdf':html?'html':'unknown',datasetVersion:db.datasetVersion});
}
if(Number(db.count)!==records.length) errors.push({type:'count_mismatch',declared:db.count,actual:records.length});
for(const [k,v] of Object.entries(db.sourceCounts||{})) if(sourceCounts[k]!==v) errors.push({type:'source_count_mismatch',source:k,declared:v,actual:sourceCounts[k]||0});
const report={node:'LEGAL-R1-N1',generatedAt:new Date().toISOString(),datasetVersion:db.datasetVersion,totalLegalRecords:records.length,sourceCounts,fullTextEligibleCount,pdfCandidates,htmlCandidates,errorCount:errors.length,errors,inventoryHash:crypto.createHash('sha256').update(JSON.stringify(inventory)).digest('hex')};
fs.mkdirSync('data/legal/audits',{recursive:true});
fs.writeFileSync('data/legal/audits/legal-r1-node1-latest.json',JSON.stringify(report,null,2)+'\n');
fs.writeFileSync('data/legal/audits/legal-r1-fulltext-inventory-latest.json',JSON.stringify({datasetVersion:db.datasetVersion,generatedAt:report.generatedAt,count:inventory.length,records:inventory},null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(errors.length) process.exit(1);
console.log(`LEGAL-R1-N1 PASS: ${records.length} records; ${fullTextEligibleCount} full-text candidates; PDF ${pdfCandidates}; HTML ${htmlCandidates}`);
