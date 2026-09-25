import {randomUUID,createHash} from 'node:crypto';
import {basename} from 'node:path';
import {requestEstimate,responseCost,NewsBudgetDeferred} from './news-cost-model.mjs';

export function createBudgetFetch({nativeFetch,rpc,pipeline,phase,runId,checkpointRead,checkpointWrite}) {
  return async function budgetFetch(input, options={}) {
    const original=new URL(input instanceof Request ? input.url : String(input));
    if (!['api.openai.com','api.x.com','api.twitter.com'].includes(original.hostname)) return nativeFetch(input,options);
    const req=new Request(input,options);
    if (req.method !== (original.hostname==='api.openai.com'?'POST':'GET')) throw new NewsBudgetDeferred('unpriced_method');
    let body={};
    if (req.method==='POST') { try { body=await req.clone().json(); } catch { throw new NewsBudgetDeferred('invalid_paid_body'); } }
    const url=new URL(original);
    // Cache identical reads briefly; never advance a watermark before the collector saves its rows.
    // User lookup metadata can safely be shared for 24h; news responses expire after 10m.
    let key=null;
    if (original.hostname!=='api.openai.com' && checkpointRead) {
      const userLookup=/^\/2\/users(?:\/by(?:\/username\/[^/]+)?|\/\d+)?$/.test(url.pathname);
      const canonical=new URL(url); canonical.searchParams.sort();
      if (userLookup) key=createHash('sha256').update(canonical.href).digest('hex');
      const prior=key ? await checkpointRead(key) : null;
      if (prior && Date.now()-Date.parse(prior.updated_at)<(userLookup?86400000:600000)) return Response.json(prior.payload);
    }
    if (original.hostname!=='api.openai.com' && url.searchParams.has('max_results')) {
      url.searchParams.set('max_results',String(Math.min(20,Number(url.searchParams.get('max_results')))));
    }
    const estimate=requestEstimate(url.href,body);
    const id=randomUUID();
    let reservation;
    try { reservation=await rpc('news_budget_reserve',{p_id:id,p_pipeline:pipeline,p_provider:estimate.provider,p_phase:phase,p_run_id:runId,p_micros:estimate.micros,p_priority:!/(extra-monitored|high-recall|added-source)/.test(phase)}); }
    catch { throw new NewsBudgetDeferred('budget_service_unavailable'); }
    if (!reservation?.allowed) throw new NewsBudgetDeferred(reservation?.reason || 'reservation_denied');
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
  const nativeFetch=globalThis.fetch;
  globalThis.fetch=createBudgetFetch({nativeFetch,...budgetDatabase(nativeFetch),pipeline,phase:basename(process.argv[1] || ''),runId:process.env.GITHUB_RUN_ID || 'local'});
}
