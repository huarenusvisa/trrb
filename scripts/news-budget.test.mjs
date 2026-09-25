import test from 'node:test';
import assert from 'node:assert/strict';
import {requestEstimate,responseCost} from './news-cost-model.mjs';
import {createBudgetFetch} from './news-budget-preload.mjs';
const body={model:'gpt-4.1-mini',input:'核实新闻',max_output_tokens:500};
const opts={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
const endpoint='https://api.openai.com/v1/responses';
function client(overrides={}) {return createBudgetFetch({pipeline:'ice',phase:'test',runId:'1',rpc:async()=>({allowed:true}),nativeFetch:async()=>Response.json({usage:{input_tokens:100,output_tokens:50},output:[]}),...overrides});}
test('known model counts cached tokens and actual search calls conservatively',()=>{
 const e=requestEstimate(endpoint,{...body,tools:[{type:'web_search'}],max_tool_calls:5});
 const actual=responseCost(e,{usage:{input_tokens:1000,output_tokens:100,input_tokens_details:{cached_tokens:500}},output:[{type:'web_search_call',status:'completed'}]});
 assert.equal(actual.micros,13610);assert.ok(e.micros>actual.micros);
});
test('X resource counting includes expanded users and tweets before editorial filtering',()=>{
 const e=requestEstimate('https://api.x.com/2/tweets/search/recent?max_results=20&expansions=author_id,referenced_tweets.id,referenced_tweets.id.author_id');
 const cost=responseCost(e,{data:[{id:'1'},{id:'2'}],includes:{tweets:[{id:'1'},{id:'3'}],users:[{id:'7'},{id:'7'}]}});
 assert.equal(cost.micros,25000);assert.ok(e.micros>=cost.micros);
 assert.equal(responseCost(e,{meta:{result_count:0}}).micros,0);
});
test('unknown model/tool/endpoint and unbounded requests fail closed',()=>{
 for (const v of [{...body,model:'unpriced'},{...body,stream:true},{...body,max_output_tokens:undefined},{...body,tools:[{type:'web_search'}]},{...body,tools:[{type:'image_generation'}]}]) assert.throws(()=>requestEstimate(endpoint,v),/NEWS_BUDGET_DEFERRED/);
 assert.throws(()=>requestEstimate('https://api.x.com/2/spaces'),/unpriced_x_endpoint/);
});
test('denied reservation or database outage makes ZERO paid requests',async()=>{
 for (const rpc of [async()=>({allowed:false,reason:'monthly_cap'}),async()=>{throw Error('unavailable');}]) {
  let calls=0;const fetch=client({rpc,nativeFetch:async()=>{calls++;}});
  await assert.rejects(fetch(endpoint,opts),/NEWS_BUDGET_DEFERRED/);assert.equal(calls,0);
 }
});
test('settles actual usage once and preserves response body and request body',async()=>{
 const calls=[];
 const fetch=client({rpc:async(name,args)=>{calls.push([name,args]);return {allowed:true};},nativeFetch:async(url,req)=>{assert.deepEqual(await new Request(url,req).json(),body);return Response.json({usage:{input_tokens:100,output_tokens:50},output:[]});}});
 const res=await fetch(endpoint,opts);assert.equal((await res.json()).usage.output_tokens,50);
 assert.equal(calls[0][0],'news_budget_reserve');assert.equal(calls[1][0],'news_budget_settle');assert.equal(calls[1][1].p_micros,120);
 assert.equal(calls[0][1].p_id,calls[1][1].p_id);
});
test('network timeout, error response or missing usage NEVER releases an uncertain reservation',async()=>{
 for(const nativeFetch of [async()=>{throw Error('timeout');},async()=>Response.json({error:'oops'},{status:500}),async()=>Response.json({status:'incomplete'})]) {
  const names=[];const fetch=client({nativeFetch,rpc:async(name)=>{names.push(name);return {allowed:true};}});
  try {await fetch(endpoint,opts);} catch {}
  assert.deepEqual(names,['news_budget_reserve']);
 }
});
test('a failed settlement preserves successful response; nonpaid requests untouched',async()=>{
 let calls=0;const fetch=client({rpc:async n=>{if(n==='news_budget_settle')throw Error('db');return {allowed:true};},nativeFetch:async()=>{calls++;return Response.json({usage:{input_tokens:1,output_tokens:1}});}});
 assert.equal((await fetch(endpoint,opts)).status,200);assert.equal((await fetch('https://www.justice.gov/news')).status,200);assert.equal(calls,2);
});
test('user cache prevents paid lookup; news reads never reuse stale cache; batch capped at 20',async()=>{
 let calls=0;
 const fetch=client({checkpointRead:async()=>({updated_at:new Date().toISOString(),payload:{data:{id:'42'}}}),nativeFetch:async u=>{calls++;assert.equal(new URL(u).searchParams.get('max_results'),'20');return Response.json({meta:{result_count:0}});}});
 assert.equal((await(await fetch('https://api.x.com/2/users/by/username/FBI')).json()).data.id,'42');assert.equal(calls,0);
 await fetch('https://api.x.com/2/tweets/search/recent?max_results=100&start_time=2026-09-25T00:00:00Z');assert.equal(calls,1);
});
