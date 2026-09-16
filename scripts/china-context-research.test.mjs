import test from 'node:test';
import assert from 'node:assert/strict';
import {citedResearch,contextRetryEligible} from './china-context-research.mjs';
test('research requires executed search and tool-generated citations, not invented links',()=>{
  assert.equal(citedResearch({output_text:'https://example.com facts'}),null);
  assert.equal(citedResearch({output:[{type:'web_search_call',status:'completed'},{content:[{type:'output_text',text:'facts',annotations:[]}]}]}),null);
  const response={output:[{type:'web_search_call',status:'completed'},{content:[{type:'output_text',text:'事实及归因',annotations:[{type:'url_citation',url:'javascript:alert(1)'},{type:'url_citation',url:'https://example.com/report',title:'原文'}]}]}]};
  assert.equal(citedResearch(response).sources.length,1);
});
test('only recent automated length holds retry once; manual, old and current-version holds stay',()=>{
  const now=Date.parse('2026-09-16T12:00:00Z');
  const row={decision:'review_required',decision_reason:'自动扩写或发布失败:采编质量拦截:正文仅440字,至少需要800字',collected_at:'2026-09-16T10:00:00Z',ai_payload:{quality_hold:true,processing_version:'single-event-800-image-v1'}};
  assert.equal(contextRetryEligible(row,now),true);
  assert.equal(contextRetryEligible({...row,decision:'rejected'},now),false);
  assert.equal(contextRetryEligible({...row,decision_reason:'人工审核:正文仅440字'},now),false);
  assert.equal(contextRetryEligible({...row,collected_at:'2026-08-01'},now),false);
  assert.equal(contextRetryEligible({...row,ai_payload:{quality_hold:true,processing_version:'china-300-600-image-v5'}},now),false);
});

test('only retrieved same-conversation public replies can be attributed, never counted as verified facts',async()=>{
 const {threadMaterials}=await import('./china-context-research.mjs');
 const payload={data:[{id:'11',conversation_id:'10',author_id:'1',text:'这是一段足够长的原发帖人后续回应，需要保留明确的来源归因。'},{id:'12',conversation_id:'10',author_id:'2',text:'这是一段足够长的读者个人观点，不能被当成已经证实的事实。'},{id:'13',conversation_id:'99',author_id:'2',text:'这是另一个事件的评论，不能混入当前报道和背景材料之中。'}],includes:{users:[{id:'1',username:'source'},{id:'2',username:'reader'}]}};
 const rows=threadMaterials(payload,'10','source');assert.equal(rows.length,2);assert.equal(rows[0].kind,'author_followup_unverified');assert.equal(rows[1].kind,'comment_opinion_unverified');assert.equal(rows[1].url,'https://x.com/i/web/status/12');
});


test('bulk length holds re-enter research only with original media, freshness and active topic', () => {
  const now = Date.parse('2026-09-16T20:00:00Z');
  const row = {decision:'review_required', decision_reason:'采编质量拦截：原发布稿不足800字或无配图，已转回待编辑；禁止无新素材自动重试', collected_at:'2026-09-15T12:00:00Z', ai_payload:{quality_hold:true,processing_version:'single-event-800-image-v1'}, raw_payload:{topic_key:'china',media:[{url:'https://example.com/original.jpg'}]}};
  assert.equal(contextRetryEligible(row,now),true);
  assert.equal(contextRetryEligible({...row,raw_payload:{media:[]}},now),false);
  assert.equal(contextRetryEligible({...row,raw_payload:{...row.raw_payload,topic_key:'ren-zhengfei'}},now),false);
  assert.equal(contextRetryEligible({...row,decision_reason:'人工拒绝：不足800字'},now),false);
  assert.equal(contextRetryEligible({...row,collected_at:'2026-09-01'},now),false);
});
