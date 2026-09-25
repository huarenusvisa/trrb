// Official prices checked 2026-09-25. Never silently guess an unknown model/endpoint.
// https://developers.openai.com/api/docs/pricing  https://docs.x.com/x-api/getting-started/pricing
export class NewsBudgetDeferred extends Error {
  constructor(reason) { super(`NEWS_BUDGET_DEFERRED: ${reason}`); this.code = 'NEWS_BUDGET_DEFERRED'; }
}
export const isBudgetDeferred = e => e?.code === 'NEWS_BUDGET_DEFERRED' || /NEWS_BUDGET_DEFERRED/.test(String(e?.message || e));
export function requestEstimate(url, body = {}) {
  const u = new URL(url);
  if (['api.x.com','api.twitter.com'].includes(u.hostname)) {
    const users = /^\/2\/users\/(?:by(?:\/username\/[^/]+)?|\d+)$/.test(u.pathname) || u.pathname === '/2/users';
    const tweets = /^\/2\/tweets(?:\/search\/recent|\/\d+)?$/.test(u.pathname) || /^\/2\/users\/\d+\/tweets$/.test(u.pathname);
    if (!users && !tweets) throw new NewsBudgetDeferred('unpriced_x_endpoint');
    const count = Number(u.searchParams.get('max_results') || (u.searchParams.get('ids') || u.searchParams.get('usernames'))?.split(',').length || (users || /^\/2\/tweets\/\d+$/.test(u.pathname) ? 1 : 10));
    if (!Number.isInteger(count) || count < 1 || count > 100) throw new NewsBudgetDeferred('unbounded_x_results');
    const expansions = u.searchParams.get('expansions') || '';
    // Referenced tweets can add up to three posts per result, each with an author.
    const postCount = tweets ? count * (expansions.includes('referenced_tweets.id') ? 4 : 1) : 0;
    const userCount = users ? count : /author_id|in_reply_to_user_id/.test(expansions) ? count + (expansions.includes('referenced_tweets.id.author_id') ? count * 3 : 0) + (expansions.includes('in_reply_to_user_id') ? count : 0) : 0;
    return {provider:'x',micros:Math.max(1,postCount*5000+userCount*10000),users};
  }
  if (u.hostname !== 'api.openai.com' || u.pathname !== '/v1/responses') throw new NewsBudgetDeferred('unpriced_paid_endpoint');
  if (!/^gpt-4\.1-mini(?:-2025-04-14)?$/.test(body.model || '')) throw new NewsBudgetDeferred('unpriced_openai_model');
  if (body.stream || body.background || !Number.isInteger(body.max_output_tokens) || body.max_output_tokens < 1) throw new NewsBudgetDeferred('unbounded_openai_request');
  const search = (body.tools || []).some(t=>t.type === 'web_search');
  if ((body.tools || []).some(t=>t.type !== 'web_search')) throw new NewsBudgetDeferred('unpriced_openai_tool');
  if (search && (!Number.isInteger(body.max_tool_calls) || body.max_tool_calls > 5 || body.max_tool_calls < 1)) throw new NewsBudgetDeferred('unbounded_search');
  const raw = JSON.stringify(body);
  const imageCount = (raw.match(/"type":"input_image"/g) || []).length;
  // Byte count bounds normal text tokenization; full image ceiling adds margin.
  const inputBound = Buffer.byteLength(raw) + imageCount*4000 + 2000;
  return {provider:'openai',model:body.model,micros:Math.ceil(inputBound*.4+body.max_output_tokens*1.6+(search?body.max_tool_calls*13200:0))};
}
export function responseCost(estimate, payload) {
  if (estimate.provider === 'x') {
    if (!payload || (!('data' in payload) && !('meta' in payload))) return null;
    const rows = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
    const posts = new Set([...(estimate.users ? [] : rows),...(payload.includes?.tweets || [])].map(x=>x.id).filter(Boolean)).size;
    const users = new Set([...(estimate.users ? rows : []),...(payload.includes?.users || [])].map(x=>x.id).filter(Boolean)).size;
    return {micros:posts*5000+users*10000,usage:{posts,users,basis:'conservative_resource_reads_no_daily_dedup_discount'}};
  }
  const v=payload?.usage;
  if (!Number.isFinite(v?.input_tokens) || !Number.isFinite(v?.output_tokens)) return null;
  const cached=Math.min(v.input_tokens, Math.max(0,v.input_tokens_details?.cached_tokens || 0));
  const searches=(payload.output || []).filter(x=>x.type==='web_search_call').length;
  // Conservatively add the 8K search-content block even if reflected in reported input.
  return {micros:Math.ceil((v.input_tokens-cached)*.4+cached*.1+v.output_tokens*1.6+searches*13200),usage:{model:estimate.model,input_tokens:v.input_tokens,cached_tokens:cached,output_tokens:v.output_tokens,search_calls:searches,basis:'reported_tokens_plus_search_fee_and_conservative_8k_block'}};
}
