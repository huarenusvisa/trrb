import test from 'node:test';
import assert from 'node:assert/strict';
import {researchEvent} from './china-context-research.mjs';
import {createBudgetFetch} from './news-budget-preload.mjs';
const endpoint='https://api.openai.com/v1/responses';
const urls=['https://apnews.com/article/synthetic-test','https://www.dhs.gov/news/synthetic-test'];
const reply=body=>Response.json({...body,usage:{input_tokens:1000,output_tokens:1000}});

test('production deep research and planner both pass the real guarded request contract without raising caps',async()=>{
 const prior=process.env.NEWS_DEPTH_COMMISSION;process.env.NEWS_DEPTH_COMMISSION='1';
 let nativeCalls=0,reserved=0,settled=0;
 const request=createBudgetFetch({pipeline:'china-hot',phase:'research-test',runId:'test',rpc:async(name,args)=>{if(name==='news_budget_reserve'){reserved++;assert.ok(args.p_micros>0&&args.p_micros<1000000);return {allowed:true};}settled++;return {settled:true};},nativeFetch:async(url,req)=>{
  nativeCalls++;const body=await req.json();assert.equal(url,endpoint);
  if(body.tools){assert.equal(body.max_tool_calls,5);assert.equal(body.max_output_tokens,7500);return reply({output:[{type:'web_search_call',status:'completed'},{type:'message',content:[{type:'output_text',text:'Synthetic fixture only. This is not real news evidence.',annotations:urls.map(url=>({type:'url_citation',url,title:'Test'}))}]}]});}
  assert.equal(body.text.format.name,'evidence_backed_depth_assignment');return reply({output_text:JSON.stringify({public_interest:false,fresh_development:true,reason:'Insufficient test fixture facts',missing_material:['No actual reporting'],sections:[]})});
 }});
 try{const result=await researchEvent({text:'Synthetic test only'},{id:'synthetic',created_at:new Date().toISOString()},{request,readJson:r=>r.json(),model:'gpt-4.1-mini',key:'test-placeholder',editorialDepth:'deep'});assert.equal(nativeCalls,2);assert.equal(reserved,2);assert.equal(settled,2);assert.equal(result.depth_assignment.requested_depth,'standard');}
 finally{if(prior===undefined)delete process.env.NEWS_DEPTH_COMMISSION;else process.env.NEWS_DEPTH_COMMISSION=prior;}
});

test('contract mismatch and exhausted budget are distinguishable and neither makes a paid request',async()=>{
 const logs=[],old=console.warn;console.warn=value=>logs.push(JSON.parse(value));let paid=0;
 const request=createBudgetFetch({pipeline:'ice',phase:'test',runId:'test',nativeFetch:async()=>{paid++;throw new Error('Paid call forbidden');},rpc:async()=>({allowed:false,reason:'hourly_pacing'})});
 const options=max_tool_calls=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',max_output_tokens:1000,max_tool_calls,tools:[{type:'web_search'}],input:'synthetic'})});
 try{await assert.rejects(request(endpoint,options(7)),/unbounded_search/);await assert.rejects(request(endpoint,options(5)),/hourly_pacing/);assert.equal(paid,0);assert.equal(logs[0].stage,'request_contract');assert.equal(logs[0].reason,'unbounded_search');assert.equal(logs[1].stage,'reservation');assert.equal(logs[1].reason,'hourly_pacing');}
 finally{console.warn=old;}
});
