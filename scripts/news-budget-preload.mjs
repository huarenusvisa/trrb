import {randomUUID,createHash} from 'node:crypto';
import {basename} from 'node:path';
import {requestEstimate,responseCost,NewsBudgetDeferred} from './news-cost-model.mjs';

export function createBudgetFetch({nativeFetch,rpc,pipeline,phase,runId,checkpointRead,checkpointWrite}) {
  function deferred(reason,stage,provider) {
    const error=new NewsBudgetDeferred(reason);
    console.warn(JSON.stringify({event:'news-budget-deferred',pipeline,phase,run_id:runId,provider,stage,reason:String(reason).slice(0,120)}));
    return error;
  }
  return async function budgetFetch(input, options={}) {
    const original=new URL(input instanceof Request ? input.url : String(input));
    if (!['api.openai.com','api.x.com','api.twitter.com'].includes(original.hostname)) return nativeFetch(input,options);
    const req=new Request(input,options);
    const provider=original.hostname==='api.openai.com'?'openai':'x';
    if (req.method !== (provider==='openai'?'POST':'GET')) throw deferred('unpriced_method','request_contract',provider);
    let body={};
    if (req.method==='POST') { try { body=await req.clone().json(); } catch { throw deferred('invalid_paid_body','request_contract',provider); } }
    const url=new URL(original);
    // Only user lookup metadata is shared for 24h. Fresh news reads remain metered.
    let key=null;
    if (provider!=='openai' && checkpointRead) {
      const userLookup=/^\/2\/users(?:\/by(?:\/username\/[^/]+)?|\/\d+)?$/.test(url.pathname);
      const canonical=new URL(url); canonical.searchParams.sort();
      if (userLookup) key=createHash('sha256').update(canonical.href).digest('hex');
      const prior=key ? await checkpointRead(key) : null;
      if (prior && Date.now()-Date.parse(prior.updated_at)<86400000) return Response.json(prior.payload);
    }
    if (provider!=='openai' && url.searchParams.has('max_results')) {
      url.searchParams.set('max_results',String(Math.min(20,Number(url.searchParams.get('max_results')))));
    }
    let estimate;
    try {estimate=requestEstimate(url.href,body);}
    catch(error){if(error?.code==='NEWS_BUDGET_DEFERRED')throw deferred(String(error.message).replace(/^NEWS_BUDGET_DEFERRED:\s*/,''),'request_contract',provider);throw error;}
    const id=randomUUID();
    let reservation;
    try { reservation=await rpc('news_budget_reserve',{p_id:id,p_pipeline:pipeline,p_provider:estimate.provider,p_phase:phase,p_run_id:runId,p_micros:estimate.micros,p_priority:!/(extra-monitored|high-recall|added-source)/.test(phase)}); }
    catch { throw deferred('budget_service_unavailable','reservation',provider); }
    if (!reservation?.allowed) throw deferred(reservation?.reason || 'reservation_denied','reservation',provider);
    // No retry here. Timeout/crash/ambiguous error leaves the full reservation charged.
    const response=await nativeFetch(url.href,req);
    if (response.ok) {
      let payload;
      try { payload=await response.clone().json(); } catch { return response; }
      const cost=responseCost(estimate,payload);
      if (cost) {
        try { await rpc('news_budget_settle',{p_id:id,p_micros:cost.micros,p_usage:cost.usage}); }
        catch { console.warn(JSON.stringify({event:'news-budget-settlement-pending',id})); }
      }
      if (key && checkpointWrite && payload) {
        try { await checkpointWrite(key,payload); } catch { console.warn('news-budget: checkpoint pending; next read remains metered'); }
      }
    }
    return response;
  };
}

export function budgetDatabase(nativeFetch=globalThis.fetch) {
  const base=String(process.env.SUPABASE_URL || '').replace(/\/+$/,'');
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  async function call(path,options={}) {
    if (!/^https:\/\//.test(base) || !secret) throw new NewsBudgetDeferred('budget_credentials_missing');
    const r=await nativeFetch(`${base}/rest/v1/${path}`,{...options,headers:{apikey:secret,Authorization:`Bearer ${secret}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(20000)});
    if (!r.ok) throw new NewsBudgetDeferred('budget_database_unavailable');
    const t=await r.text(); return t?JSON.parse(t):null;
  }
  return {
    rpc:(name,body={})=>call(`rpc/${name}`,{method:'POST',body:JSON.stringify(body)}),
    checkpointRead:async key=>(await call(`news_x_checkpoints?key=eq.${key}&select=payload,updated_at&limit=1`))?.[0],
    checkpointWrite:(key,payload)=>call('news_x_checkpoints?on_conflict=key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({key,payload,updated_at:new Date().toISOString()})})
  };
}
if (process.env.NEWS_BUDGET_ENFORCE==='1') {
  const pipeline=process.env.NEWS_BUDGET_PIPELINE;
  if (!['ice','china-hot'].includes(pipeline)) throw new Error('News budget pipeline is required');
  console.log(JSON.stringify({event:'news-budget-enabled',pipeline,phase:basename(process.argv[1] || '')}));
  const nativeFetch=globalThis.fetch;
  globalThis.fetch=createBudgetFetch({nativeFetch,...budgetDatabase(nativeFetch),pipeline,phase:basename(process.argv[1] || ''),runId:process.env.GITHUB_RUN_ID || 'local'});
}
