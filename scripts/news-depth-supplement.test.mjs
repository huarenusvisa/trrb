import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./china-context-research.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
test('deep evidence gaps get one bounded supplement and retain cited provenance',async()=>{
 const previous=process.env.NEWS_DEPTH_COMMISSION;process.env.NEWS_DEPTH_COMMISSION='1';
 try {
  let assignments=0,lookups=0;
  const commission=async research=>({...research,depth_assignment:{requested_depth:++assignments===1?'standard':'deep',missing_material:assignments===1?['原始文件与独立跟进']:[]}});
  const {researchEvent}=new Function('commissionDepth','DEEP_RESEARCH_INSTRUCTIONS','EDITORIAL_POLICY_VERSION',source+'\nreturn {researchEvent};')(commission,'','test');
  const result=await researchEvent({text:'美国政府宣布政策'},{id:'1'},{model:'test',key:'test',editorialDepth:'deep',readJson:r=>r,request:async(url,options)=>{
   const body=JSON.parse(options.body);lookups++;
   assert.equal(body.supplemental_lookup,undefined);
   const data=JSON.parse(body.input);
   assert.equal(data.supplemental_lookup,lookups===2);
   if(lookups===2)assert.deepEqual(data.missing_evidence,['原始文件与独立跟进']);
   return {output:[{type:'web_search_call',status:'completed'},{content:[{type:'output_text',text:'查证资料'+lookups,annotations:[{type:'url_citation',url:'https://evidence'+lookups+'.gov/report',title:'原始来源'}]}]}]};
  }});
  assert.equal(lookups,2);assert.equal(result.sources.length,2);assert.equal(result.depth_assignment.requested_depth,'deep');assert.match(result.text,/查证资料1/);assert.match(result.text,/查证资料2/);
 }finally{if(previous===undefined)delete process.env.NEWS_DEPTH_COMMISSION;else process.env.NEWS_DEPTH_COMMISSION=previous;}
});
test('persistent gaps stop after the supplement',async()=>{
 const previous=process.env.NEWS_DEPTH_COMMISSION;process.env.NEWS_DEPTH_COMMISSION='1';
 try {
  let lookups=0;
  const {researchEvent}=new Function('commissionDepth','DEEP_RESEARCH_INSTRUCTIONS','EDITORIAL_POLICY_VERSION',source+'\nreturn {researchEvent};')(async research=>({...research,depth_assignment:{requested_depth:'standard',missing_material:['资料不足']}}),'','test');
  const result=await researchEvent({text:'美国政策'},{id:'1'},{model:'test',key:'test',editorialDepth:'deep',readJson:r=>r,request:async()=>{lookups++;return {output:[{type:'web_search_call',status:'completed'},{content:[{type:'output_text',text:'有限资料',annotations:[{type:'url_citation',url:'https://evidence.gov/report'}]}]}]};}});
  assert.equal(lookups,2);assert.equal(result.depth_assignment.requested_depth,'standard');
 }finally{if(previous===undefined)delete process.env.NEWS_DEPTH_COMMISSION;else process.env.NEWS_DEPTH_COMMISSION=previous;}
});
