import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KEY=process.env.OPENAI_API_KEY||'';
const MODEL=process.env.OPENAI_MODEL||'gpt-5-mini';
const LIMIT=Math.max(3,Math.min(60,Number(process.env.ROUND15_AI_BATCH||24)));
if(!KEY) throw new Error('Missing OPENAI_API_KEY');
const checks=[];let failures=0;
function check(ok,label,detail=''){checks.push({ok:Boolean(ok),label,detail});if(!ok)failures++;console.log(`${ok?'PASS':'FAIL'} ${label}${detail?` — ${detail}`:''}`)}
function outputText(data){if(data?.output_text)return data.output_text;for(const item of data?.output||[])for(const c of item?.content||[])if(c?.type==='output_text'&&c?.text)return c.text;return''}
function cleanHtml(s=''){return s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim()}
async function fetchText(url,id){
  const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'TRRB-Legal-AI/1.0 (+https://trrb.net)','accept':'application/pdf,text/html,*/*;q=0.8'}});
  if(!r.ok)throw new Error(`source ${r.status}`);
  const type=r.headers.get('content-type')||'';
  if(/pdf/i.test(type)||/\.pdf(?:$|[?#])/i.test(r.url)){
    const bytes=Buffer.from(await r.arrayBuffer());
    const pdf=join(tmpdir(),`r15-${id}.pdf`),txt=join(tmpdir(),`r15-${id}.txt`);
    await import('node:fs').then(fs=>fs.writeFileSync(pdf,bytes));
    try{execFileSync('pdftotext',['-layout',pdf,txt],{stdio:'ignore',timeout:45000});return readFileSync(txt,'utf8').replace(/\s+/g,' ').trim().slice(0,60000)}catch{return''}
  }
  return cleanHtml(await r.text()).slice(0,60000);
}
async function analyze(record,sourceText){
  const schema={type:'object',additionalProperties:false,required:['chineseTitle','summary','legalIssue','holdingOrRule','impact','sourceGrounding','disclaimer'],properties:{chineseTitle:{type:'string'},summary:{type:'string'},legalIssue:{type:'string'},holdingOrRule:{type:'string'},impact:{type:'string'},sourceGrounding:{type:'string'},disclaimer:{type:'string'}}};
  const prompt=`你是唐人日报“美国判例与新规”法律资料编辑。必须只依据下方官方一手材料生成中文解析，不得引用或模仿Westlaw、Lexis等商业摘要，不得补充材料中没有的事实，不得把行政命令/行政规则称为国会法律。若材料不足以确认裁判结果，holdingOrRule必须明确写“官方材料不足，无法确认裁判结论”。必须尽量覆盖官方材料能够确认的标题、核心规则、裁判结论和重要结构，不得用一句泛化摘要代替可确认的官方内容。\n\n记录元数据：${JSON.stringify({sourceSystem:record.sourceSystem,authorityType:record.authorityType,issuingBody:record.issuingBody,title:record.title,citation:record.citation,docket:record.docket,publicationDate:record.publicationDate,officialUrl:record.officialUrl})}\n\n官方材料：\n${sourceText}\n\n要求：summary 120-320个汉字；legalIssue说明核心法律问题；holdingOrRule说明裁判结论/行政规则核心内容；impact说明可能影响的对象和范围，并明确区分“直接法律效力”和“可能影响”；sourceGrounding说明解析依据官方来源；disclaimer固定说明“仅供信息参考，不构成法律意见，法律效力以官方原文及后续裁判/规则为准”。只返回JSON。`;
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,input:prompt,max_output_tokens:2200,text:{format:{type:'json_schema',name:'trrb_legal_analysis',strict:true,schema}}})});
  const raw=await res.text();if(!res.ok)throw new Error(`OpenAI ${res.status}: ${raw.slice(0,500)}`);const data=JSON.parse(raw),text=outputText(data);if(!text)throw new Error('OpenAI returned no output text');return JSON.parse(text)
}

const db=JSON.parse(readFileSync('data/legal/unified-legal-authorities-latest.json','utf8'));
let prior={analyses:[]};if(existsSync('data/legal/legal-ai-analysis-latest.json')){try{prior=JSON.parse(readFileSync('data/legal/legal-ai-analysis-latest.json','utf8'))}catch{}}
const recordMap=new Map((db.records||[]).map(r=>[String(r.id),r]));
const map=new Map();
const archivedOrphans=[];
const staleMetadata=[];
for(const a of prior.analyses||[]){
  const r=recordMap.get(String(a.recordId||''));
  if(!r){archivedOrphans.push(String(a.recordId||''));continue;}
  const metadataFields=['sourceSystem','authorityType','issuingBody','officialUrl','title'];
  if(metadataFields.some(field=>String(a[field]??'')!==String(r[field]??''))){staleMetadata.push(String(a.recordId||''));continue;}
  map.set(String(a.recordId),{...a,datasetVersion:db.datasetVersion});
}
const priority={SCOTUS:0,BIA:1,US_CIRCUIT:2,WHITE_HOUSE:3,FEDERAL_REGISTER:4};
const candidates=[...(db.records||[])].filter(r=>r.officialUrl&&!map.has(String(r.id))).sort((a,b)=>(priority[a.sourceSystem]??9)-(priority[b.sourceSystem]??9)||String(b.publicationDate||'').localeCompare(String(a.publicationDate||''))).slice(0,LIMIT);
check((db.records||[]).length>0,'unified legal database available',`records=${(db.records||[]).length}`);
check(db.datasetVersion&&/^[a-f0-9]{64}$/.test(db.datasetVersion),'unified dataset version available',String(db.datasetVersion).slice(0,16));
check(candidates.length>0||map.size>0,'AI analysis has records to process or preserve',`new=${candidates.length}; existing=${map.size}`);
check(new Set([...map.keys()]).size===map.size,'active Chinese analyses have unique recordId bindings');
let generated=0,sourceFailures=0,modelFailures=0;
for(const r of candidates){
  try{
    const sourceText=await fetchText(r.officialUrl,r.id);
    if(sourceText.length<250){sourceFailures++;console.log(`WARN source text too short ${r.id} chars=${sourceText.length}`);continue;}
    try{const a=await analyze(r,sourceText);map.set(String(r.id),{recordId:r.id,datasetVersion:db.datasetVersion,sourceSystem:r.sourceSystem,authorityType:r.authorityType,issuingBody:r.issuingBody,officialUrl:r.officialUrl,title:r.title||null,...a});generated++;console.log(`PASS AI analysis ${r.sourceSystem} ${r.id}`)}catch(e){modelFailures++;console.log(`WARN model ${r.id}: ${e.message}`)}
  }catch(e){sourceFailures++;console.log(`WARN source ${r.id}: ${e.message}`)}
}
const analyses=[...map.values()].sort((a,b)=>a.sourceSystem.localeCompare(b.sourceSystem)||String(a.recordId).localeCompare(String(b.recordId)));
check(analyses.length>=Math.min(3,Math.max(1,candidates.length)),'Chinese legal analyses generated/preserved',`analyses=${analyses.length}; generated=${generated}`);
check(analyses.every(a=>a.summary&&a.legalIssue&&a.holdingOrRule&&a.impact&&a.sourceGrounding&&a.disclaimer),'AI analysis fields complete');
check(analyses.every(a=>/不构成法律意见/.test(a.disclaimer)),'all analyses include legal-information disclaimer');
check(analyses.every(a=>recordMap.has(String(a.recordId))),'all active analyses bind to current official records');
check(analyses.every(a=>String(a.datasetVersion||'')===String(db.datasetVersion||'')),'all active analyses bind to current dataset version');
check(modelFailures===0,'AI model calls completed without failures',`failures=${modelFailures}`);
check(sourceFailures<=Math.max(3,Math.floor(candidates.length/2)),'official-source extraction reliability acceptable',`sourceFailures=${sourceFailures}/${candidates.length}`);
mkdirSync('data/legal',{recursive:true});
writeFileSync('data/legal/legal-ai-analysis-latest.json',JSON.stringify({schemaVersion:1,datasetVersion:db.datasetVersion,scope:'Chinese legal-information analyses grounded only in first-party official source text. Database layer; not ordinary news articles.',count:analyses.length,analyses},null,2)+'\n');
writeFileSync('round15-node7-ai-legal-analysis-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),datasetVersion:db.datasetVersion,candidates:candidates.length,generated,sourceFailures,modelFailures,count:analyses.length,archivedOrphans,staleMetadata,checks,failures},null,2)+'\n');
console.log(`ROUND15 NODE7 audit: analyses=${analyses.length}; generated=${generated}; archivedOrphans=${archivedOrphans.length}; staleMetadata=${staleMetadata.length}; checks=${checks.length}; failures=${failures}`);
if(failures===0)console.log('ROUND15 NODE7 PASS: grounded Chinese holdings, legal issues and impact analysis verified');else{console.log('ROUND15 NODE7 FAIL: Chinese legal analysis pipeline gaps remain');process.exitCode=1}
