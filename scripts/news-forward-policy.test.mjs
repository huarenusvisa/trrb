import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {officialEventRelation,officialPostSignature,depthAssignment,commissionDepth,forwardQuery,inForwardScope,depthInstruction} from './news-forward-policy.mjs';
import {findDuplicateStory,eventSignature} from './ice-fast-intake.mjs';
import {translate} from './ice-translate-title-body.mjs';
import {DEEP_REVIEW_FIELDS} from './news-editorial-policy.mjs';
const post=(id,name,action='arrested')=>({id:'row-'+id,x_post_id:id,x_url:`https://x.com/ICEgov/status/${id}`,source_type:'official',trust_tier:1,source_username:'ICEgov',source_created_at:'2026-09-26T12:00:00Z',source_text:`ICE officers ${action} ${name}, a Mexican national, in California. He will remain in ICE custody pending proceedings. This synthetic fixture is not news or publication evidence.`,media:[]});
const story=p=>({id:'story-'+p.id,event_fingerprint:'legacy-shared-fingerprint',official_source_count:1,ai_payload:{lead_source_post_id:p.x_post_id,lead_source_text_original:p.source_text,lead_source_url:p.x_url,lead_source_created_at:p.source_created_at,lead_source_type:'official',lead_source_trust_tier:1}});
const sources=[{url:'https://apnews.com/article/synthetic-one',kind:'web_evidence',tool_cited:true},{url:'https://www.dhs.gov/news/synthetic-two',kind:'web_evidence',tool_cited:true}];
const research={web_search_completed:true,text:'Synthetic research fixture, never publication evidence.',sources};
const plan={public_interest:true,fresh_development:true,reason:'Synthetic complete plan',missing_material:[],sections:Array.from({length:6},(_,i)=>({question:`Question ${i}`,facts:[{fact:`Synthetic fact ${i}A`,source_urls:[sources[0].url]},{fact:`Synthetic fact ${i}B`,source_urls:[sources[1].url]}]}))};
const jsonResponse=value=>new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]}),{status:200,headers:{'Content-Type':'application/json'}});

test('different named official cases never merge because they share agency, nationality, place or language',()=>{
 const cases=['Alex Vega-Ruiz','Bruno Ortega-Diaz','Carlos Leon-Soto','Diego Mena-Cruz','Emilio Perez-Luna'].map((n,i)=>post(String(91000+i),n));
 for(let i=0;i<cases.length;i++)for(let j=i+1;j<cases.length;j++){
  assert.equal(officialEventRelation(cases[i],story(cases[j])),false);
  assert.equal(findDuplicateStory(cases[i],[story(cases[j])]),null);
  assert.notEqual(eventSignature(cases[i]),eventSignature(cases[j]));
 }
});
test('the same original ID or exact attributed release is still deduplicated',()=>{
 const p=post('92001','Alex Vega-Ruiz');assert.equal(officialEventRelation(p,story(p)),true);
 const repost={...p,x_post_id:'92002',x_url:'https://x.com/DHSgov/status/92002'};
 assert.equal(officialEventRelation(repost,story(p)),true);
 assert.ok(findDuplicateStory(repost,[story(p)]));
});
test('the same person with a different action and date is not automatically the same event',()=>{
 const p=post('93001','Alex Vega-Ruiz');const next={...post('93002','Alex Vega-Ruiz','released'),source_created_at:'2026-09-27T12:00:00Z'};
 assert.equal(officialEventRelation(next,story(p)),false);
});
test('shared generic statistics without positive identity cannot merge official records',()=>{
 const a=post('94001','Alex Vega-Ruiz'),b=post('94002','Bruno Ortega-Diaz');a.source_text+=' Previous 3 removals, 60 years old.';b.source_text+=' Previous 3 removals, 60 years old.';
 assert.equal(officialEventRelation(a,story(b)),false);
 assert.equal(officialPostSignature({...a,trust_tier:4}), '');
});
test('nonofficial pairs retain the existing nonofficial handling rather than gain automatic official approval',()=>{
 assert.equal(officialEventRelation({source_type:'individual',trust_tier:4},{source_type:'media',trust_tier:3}),null);
});
test('forward cutoff is fixed and excludes old or undated rows',()=>{
 const prior=process.env.NEWS_FORWARD_ONLY_FROM;
 try {process.env.NEWS_FORWARD_ONLY_FROM='2026-09-26T18:00:00Z';assert.deepEqual(forwardQuery(),{created_at:'gte.2026-09-26T18:00:00.000Z'});assert.equal(inForwardScope({created_at:'2026-09-25T19:00:00Z'}),false);assert.equal(inForwardScope({created_at:'2026-09-26T18:01:00Z'}),true);assert.equal(inForwardScope({}),false);process.env.NEWS_FORWARD_ONLY_FROM='invalid';assert.throws(forwardQuery);}
 finally{if(prior===undefined)delete process.env.NEWS_FORWARD_ONLY_FROM;else process.env.NEWS_FORWARD_ONLY_FROM=prior;}
});
test('a deep commission requires real retrieved citations, enough nonrepeated questions and independent publishers',()=>{
 const assignment=depthAssignment(research,plan);assert.equal(assignment.requested_depth,'deep');assert.deepEqual(assignment.target_chinese_chars,[2000,3500]);assert.match(depthInstruction({...research,depth_assignment:assignment}),/独立深度采编任务/);
 assert.equal(depthAssignment({...research,web_search_completed:false},plan).requested_depth,'standard');
 assert.equal(depthAssignment(research,{...plan,sections:plan.sections.slice(0,2)}).requested_depth,'standard');
 assert.equal(depthAssignment(research,{...plan,missing_material:['No verified follow-up']}).requested_depth,'standard');
 assert.equal(depthAssignment(research,{...plan,public_interest:false}).requested_depth,'standard');
 const fabricated=structuredClone(plan);fabricated.sections.forEach(s=>s.facts[0].source_urls=['https://invented.example/fake']);assert.equal(depthAssignment(research,fabricated).requested_depth,'standard');
});
test('commission planner sees cited research and never makes a paid call with fewer than two sources',async()=>{
 let calls=0;const options={model:'test',key:'not-a-secret',readJson:r=>r.json(),request:async(url,init)=>{calls++;const body=JSON.parse(init.body);assert.equal(body.text.format.name,'evidence_backed_depth_assignment');assert.match(body.input,/synthetic-one/);return jsonResponse(plan);}};
 const result=await commissionDepth(research,options);assert.equal(result.depth_assignment.requested_depth,'deep');assert.equal(calls,1);
 const short=await commissionDepth({...research,sources:sources.slice(0,1)},options);assert.equal(short.depth_assignment.requested_depth,'standard');assert.equal(calls,1);
});
test('a commissioned deep task cannot silently complete as a brief: writer retries once, then independently reviews',async()=>{
 const previous=globalThis.fetch;let writes=0,reviews=0;
 const completeReview=Object.fromEntries([...DEEP_REVIEW_FIELDS,'single_event','grounded','sufficient','source_chain_complete','analysis_grounded','depth_appropriate','court_status_correct','fresh_event','image_grounded'].map(k=>[k,true]));completeReview.reason='Synthetic review fixture only';
 globalThis.fetch=async(url,init)=>{const body=JSON.parse(init.body);if(body.text?.format?.name==='ice_chinese_title_body'){writes++;assert.match(body.instructions,/独立深度采编任务/);return jsonResponse({title:'测试用合成稿件不得发布',summary:'测试',content:'测试事实'.repeat(writes===1?100:550),source_language:'English',image_observations:'',appears_old_news:false,old_news_reason:'',editorial_depth:writes===1?'brief':'deep',depth_reason:'Synthetic fixture',source_sufficient:true});}reviews++;return jsonResponse(completeReview);};
 try {const result=await translate({id:'synthetic',title:'测试'},[post('95001','Alex Vega-Ruiz')],0,{research:{...research,depth_assignment:depthAssignment(research,plan)},research_attempted:true,research_error:'',force_standard:false});assert.equal(writes,2);assert.equal(reviews,1);assert.equal(result.editorial_depth,'deep');assert.equal(result.targetMin,2000);}
 finally{globalThis.fetch=previous;}
});
test('installed production uses the same final review and publisher; legacy rewriting and cleanup are absent',()=>{
 const workflow=readFileSync('.github/workflows/ice-unified-pipeline.yml','utf8');assert.match(workflow,/NEWS_DEPTH_COMMISSION: "1"/);assert.match(workflow,/NEWS_FORWARD_ONLY_FROM:/);assert.match(workflow,/node scripts\/ice-translate-title-body.mjs/);assert.match(workflow,/node scripts\/ice-trusted-source-promote.mjs/);assert.match(workflow,/node scripts\/ice-publish-due.mjs/);assert.doesNotMatch(workflow,/node scripts\/ice-(editorial-normalize|clean-existing-review-duplicates|ai-process-only)\.mjs/);
 const chinese=readFileSync('scripts/china-hot-li-teacher-ingest.mjs','utf8');assert.match(chinese,/depthInstruction\(tweet.context_research\)/);assert.match(chinese,/historical-not-reprocessed/);
});
