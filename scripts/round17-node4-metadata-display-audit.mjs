import fs from 'node:fs';
const js=fs.readFileSync('legal/detail.js','utf8');
const spec=fs.readFileSync('docs/ROUND17-LEGAL-KNOWLEDGE-SEARCH-AND-RELIABILITY.md','utf8');
const checks=[
  ['node4 name fixed',spec.includes('4. 案号、引证、机构与发布日期标准化展示')],
  ['field whitespace normalization exists',js.includes("normalize('NFKC').replace(/\\s+/g,' ').trim()")],
  ['date uses stable YYYY-MM-DD format',js.includes("return `${y}-${m}-${day}`")],
  ['issuing body has explicit fallback',js.includes("'发布机构未提取'")],
  ['docket has explicit fallback',js.includes("'案号未提取'")],
  ['citation has explicit fallback',js.includes("'正式引证未提取'")],
  ['detail metadata uses standardized body',js.includes('displayBody(r),displayDate(r.publicationDate)')],
  ['detail fields use standardized docket',js.includes("pair('案号',displayDocket(r.docket))")],
  ['detail fields use standardized citation',js.includes("pair('正式引证',displayCitation(r.citation))")],
  ['official raw identifiers remain source of truth',js.includes('r.docket')&&js.includes('r.citation')&&js.includes('r.issuingBody')&&js.includes('r.publicationDate')],
  ['related records still preserved',js.includes('renderRelated(r,records)')]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed++;}
if(failed){console.error(`ROUND 17 NODE 4: FAIL (${failed}/${checks.length} failed)`);process.exit(1);}
console.log(`ROUND 17 NODE 4: PASS (${checks.length}/${checks.length})`);
