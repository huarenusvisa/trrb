import fs from 'node:fs';

const html=fs.readFileSync('legal/detail.html','utf8');
const js=fs.readFileSync('legal/detail.js','utf8');
const spec=fs.readFileSync('docs/ROUND17-LEGAL-KNOWLEDGE-SEARCH-AND-RELIABILITY.md','utf8');
const checks=[
  ['node3 name fixed',spec.includes('3. 法律详情页相关判例/同机构规则关联发现')],
  ['related section exists',html.includes('id="detail-related"')&&html.includes('id="detail-related-list"')],
  ['related disclaimer limits to real database records',html.includes('统一法律数据库中的真实官方记录')],
  ['current record is excluded',js.includes("String(r.id)!==String(base.id)")],
  ['same issuing body is weighted',js.includes('candidate.issuingBody===base.issuingBody')],
  ['same source is weighted',js.includes('candidate.sourceSystem===base.sourceSystem')],
  ['same authority type is weighted',js.includes('candidate.authorityType===base.authorityType')],
  ['recommendations are capped',js.includes('.slice(0,6)')],
  ['recommendations use database records',js.includes('renderRelated(r,records)')],
  ['recommended links resolve by real id',js.includes('encodeURIComponent(r.id)')],
  ['official links remain available',js.includes('r.officialUrl')],
  ['AI is not used to create related records',!js.includes('generateRelated')&&!js.includes('completion')]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}: ${name}`);if(!ok)failed++;}
if(failed){console.error(`ROUND 17 NODE 3: FAIL (${failed}/${checks.length} failed)`);process.exit(1);}
console.log(`ROUND 17 NODE 3: PASS (${checks.length}/${checks.length})`);
