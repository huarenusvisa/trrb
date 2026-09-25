import test from 'node:test';
import assert from 'node:assert/strict';
import {needsReviewRecheck,verifyFreshDevelopment,allowedMediaPage,findSourceImages} from './news-editorial-support.mjs';
import {publicationQualityReport} from './news-quality-report.mjs';
import {contentDigest,DEEP_REVIEW_FIELDS} from './news-editorial-policy.mjs';

test('tier recheck never silently converts a failed factual finding to approval',()=>{
  assert.equal(needsReviewRecheck({grounded:true,single_event:true,sufficient:false},['grounded','single_event','sufficient']),true);
  assert.equal(needsReviewRecheck({grounded:false,single_event:true,sufficient:true},['grounded','single_event','sufficient']),false);
  assert.equal(needsReviewRecheck({grounded:true,single_event:true,sufficient:true},['grounded','single_event','sufficient']),false);
});

test('freshness recheck requires evidence, valid recent dates and timezone context',async()=>{
  const now=new Date('2026-09-25T17:00:00Z');
  for(const [event_date,evidence,fresh,expected] of [
    ['2026-09-25','原文明确载明9月25日公布新裁定',true,true],
    ['2026-09-26','明日将发布',true,false],
    ['2025-09-25','旧材料重新上传',true,false],
    ['invalid','原文日期不明',true,false],
    ['2026-09-25','',true,false],
    ['2026-09-25','只有上传日期',false,false],
  ]) {
    const result=await verifyFreshDevelopment({source:'材料',sourceDate:now.toISOString(),now,invoke:async request=>{
      const input=JSON.parse(request.input);
      assert.equal(input.current_date_new_york,'2026-09-25');
      assert.equal(input.current_time_utc,now.toISOString());
      return {event_date,evidence,fresh};
    }});
    assert.equal(result.fresh,expected,event_date+' '+evidence);
  }
});

test('photo lookup only visits bounded publisher pages and does not follow redirects',async()=>{
  for(const url of ['http://ice.gov/a','https://ice.gov.evil.test/a','https://127.0.0.1/a','https://user@ice.gov/a','https://ice.gov:444/a'])assert.equal(allowedMediaPage(url),false);
  const calls=[];
  const photos=await findSourceImages(['https://ice.gov/a','https://ice.gov/a','https://justice.gov/b','https://reuters.com/c','https://apnews.com/d','https://localhost/a'],{fetcher:async(url,options)=>{
    calls.push(url);assert.equal(options.redirect,'error');
    return new Response('<meta content="https://cdn.example.org/news.jpg?a=1&amp;b=2" property="og:image">',{headers:{'content-type':'text/html'}});
  }});
  assert.equal(calls.length,3);assert.equal(photos.length,3);
  assert.equal(photos[0].url,'https://cdn.example.org/news.jpg?a=1&b=2');
  assert.equal(photos[0].source_page,'https://ice.gov/a');
  const bad=await findSourceImages(['https://ice.gov/a'],{fetcher:async()=>new Response('<meta property="og:image" content="http://127.0.0.1/a">',{headers:{'content-type':'text/html'}})});
  assert.deepEqual(bad,[]);
});

test('quality report counts new articles once and requires actual evidence, review and unchanged text for depth',()=>{
  const now=Date.parse('2026-09-25T17:00:00Z');
  const title='法院发布新裁定',content='中'.repeat(2000);
  const base={id:'a',title,content,status:'published',visibility:'public',published_at:new Date(now-3600000).toISOString(),automation_source:'china-hot-li-teacher-v2',metadata:{editorial_depth:'deep',reviewed_content_sha256:contentDigest(title,content),editorial_review:Object.fromEntries(['single_event','grounded','sufficient','source_chain_complete','analysis_grounded','depth_appropriate','court_status_correct','fresh_hot_event',...DEEP_REVIEW_FIELDS].map(k=>[k,true])),context_research:{web_search_completed:true,sources:['https://justice.gov/a','https://reuters.com/b'].map(url=>({url,tool_cited:true,kind:'web_evidence'}))}}};
  const rows=[base,base,{...base,id:'b',content:content+'改'},{...base,id:'c',metadata:{...base.metadata,context_research:{}}},{...base,id:'old',published_at:new Date(now-8*86400000).toISOString()},{...base,id:'private',visibility:'private'},{...base,id:'ice',automation_source:null,metadata:{...base.metadata,event_fingerprint:'ice-test'}}];
  const report=publicationQualityReport(rows,{now});
  assert.equal(report.total.published,4);assert.equal(report.total.deep,2);assert.equal(report.total.over_2000,1);
  assert.equal(report.groups.china_hot.deep_share,0.3333);assert.equal(report.target_is_publication_gate,false);
});

import {discardDuplicateCandidate} from './china-hot-li-teacher-ingest.mjs';
test('confirmed duplicates discard their draft, keep the published original and respect concurrent editors',async()=>{
  for(const lock of [false,true]){
    const calls=[];
    const deleted=await discardDuplicateCandidate({id:42},'published-original','same event without new facts',{rest:async(table,opts)=>{
      calls.push({table,...opts});
      if(!opts.method)return [{id:42,article_id:'private-duplicate',updated_at:'current',decision:'review_required',ai_payload:{manual_editor_lock:lock}}];
      if(opts.method==='PATCH')return [{id:42}];
      return null;
    }});
    assert.equal(deleted,!lock);
    if(lock)assert.equal(calls.length,1);
    else{
      const patch=calls.find(x=>x.method==='PATCH');
      assert.equal(patch.body.raw_text,'');assert.equal(patch.body.ai_payload.status,'deleted_duplicate');
      assert.equal(patch.body.ai_payload.duplicate_article_id,'published-original');
      const removal=calls.find(x=>x.method==='DELETE');
      assert.equal(removal.query.id,'eq.private-duplicate');assert.equal(removal.query.status,'neq.published');
    }
  }
});
