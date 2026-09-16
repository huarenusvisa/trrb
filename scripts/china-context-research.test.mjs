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
  assert.equal(contextRetryEligible({...row,ai_payload:{quality_hold:true,processing_version:'single-event-800-context-v2'}},now),false);
});
