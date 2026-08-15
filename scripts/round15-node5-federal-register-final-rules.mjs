import { writeFileSync } from 'node:fs';

const API = 'https://www.federalregister.gov/api/v1/documents.json?per_page=50&order=newest&conditions%5Btype%5D%5B%5D=RULE';
const UA = 'TRRB-Legal-Collector/1.0 (+https://trrb.net)';
const checks=[]; let failures=0;
function check(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`)}
async function getJson(url){const ac=new AbortController();const t=setTimeout(()=>ac.abort(),20000);try{const r=await fetch(url,{redirect:'follow',headers:{'user-agent':UA,'accept':'application/json'},signal:ac.signal});const text=await r.text();let json=null;try{json=JSON.parse(text)}catch{}return{ok:r.ok,status:r.status,url:r.url,type:r.headers.get('content-type')||'',json,text}}catch(e){return{ok:false,status:0,url,json:null,text:'',type:'',error:String(e?.message||e)}}finally{clearTimeout(t)}}
async function probe(url){if(!url)return{ok:false,status:0};const ac=new AbortController();const t=setTimeout(()=>ac.abort(),15000);try{const r=await fetch(url,{redirect:'follow',headers:{'user-agent':UA,'accept':'application/pdf,text/html,*/*;q=0.8'},signal:ac.signal});return{ok:r.ok,status:r.status,url:r.url,type:r.headers.get('content-type')||''}}catch(e){return{ok:false,status:0,error:String(e?.message||e)}}finally{clearTimeout(t)}}

const res=await getJson(API);
check(res.ok&&res.status===200,'FederalRegister.gov official API reachable',`status=${res.status}`);
check(/^https:\/\/(www\.)?federalregister\.gov\/api\/v1\//i.test(res.url),'collection uses official Federal Register API',res.url);
check(res.json&&Array.isArray(res.json.results),'API returns document result array');

const raw=Array.isArray(res.json?.results)?res.json.results:[];
const rules=raw.filter(d=>String(d.type||'').toLowerCase()==='rule').map(d=>({
  authorityType:'Federal Register Final Rule',
  documentNumber:d.document_number||null,
  title:d.title||null,
  publicationDate:d.publication_date||null,
  agencies:Array.isArray(d.agencies)?d.agencies.map(a=>({id:a.id??null,name:a.name||a.raw_name||null,slug:a.slug||null})):[],
  abstract:d.abstract||null,
  action:d.action||null,
  effectiveOn:d.effective_on||null,
  htmlUrl:d.html_url||null,
  officialPdfUrl:d.pdf_url||null,
  publicInspectionPdfUrl:d.public_inspection_pdf_url||null,
  citation:d.citation||null,
  sourceApi:API
}));
const dedup=[...new Map(rules.filter(r=>r.documentNumber).map(r=>[r.documentNumber,r])).values()];
check(dedup.length>=10,'recent final rules collected from API',`count=${dedup.length}`);
check(dedup.length===rules.filter(r=>r.documentNumber).length,'document numbers are unique',`unique=${dedup.length}/${rules.filter(r=>r.documentNumber).length}`);
check(dedup.every(r=>r.title&&r.publicationDate&&r.documentNumber),'core final-rule fields complete');
check(dedup.every(r=>!r.htmlUrl||/^https:\/\/(www\.)?federalregister\.gov\//i.test(r.htmlUrl)),'HTML references remain on FederalRegister.gov');
check(dedup.every(r=>!r.officialPdfUrl||/^https:\/\/(www\.)?(govinfo\.gov|federalregister\.gov)\//i.test(r.officialPdfUrl)),'official PDF references use Federal Register/GovInfo domains');

let bad=0;let checked=0;
for(const r of dedup.filter(x=>x.officialPdfUrl).slice(0,5)){checked++;const p=await probe(r.officialPdfUrl);if(!p.ok||p.status!==200)bad++;}
check(checked>=3&&bad===0,'latest official final-rule PDFs reachable',`checked=${checked}; bad=${bad}`);

const output={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  scope:'Federal Register documents classified by the official API as Rule. FederalRegister.gov is used for discovery/metadata; official PDF links should be used for authoritative legal text.',
  sourceApi:API,
  count:dedup.length,
  rules:dedup
};
writeFileSync('data/legal/federal-register-final-rules-latest.json',JSON.stringify(output,null,2)+'\n');
writeFileSync('round15-node5-federal-register-final-rules-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),sourceApi:API,checks,failures,count:dedup.length},null,2)+'\n');
console.log(`ROUND15 NODE5 audit: rules=${dedup.length}; checks=${checks.length}; failures=${failures}`);
if(failures===0)console.log('ROUND15 NODE5 PASS: Federal Register final-rule API collection verified');else{console.log('ROUND15 NODE5 FAIL: Federal Register final-rule collection gaps remain');process.exitCode=1}
