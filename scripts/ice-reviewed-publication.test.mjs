import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewedSourceReady } from './ice-reviewed-publication.mjs';
import { EDITORIAL_POLICY_VERSION, ICE_TRANSLATION_VERSION, contentDigest } from './news-editorial-policy.mjs';
import { main as promote } from './ice-trusted-source-promote.mjs';
import { dueStories, publish } from './ice-publish-due.mjs';

function fixture(now = Date.now()) {
  const title = 'ICE公布执法行动情况', content = '美国移民与海关执法局公布纽约执法行动，案件正在处理中。';
  const post = {id:'post-1', x_post_id:'source-1', x_url:'https://x.com/reporter/status/1',
    source_type:'monitored_individual', source_username:'reporter', trust_tier:4,
    source_text:'ICE announced an immigration enforcement arrest in New York.', source_created_at:new Date(now-3600000).toISOString(),media:[]};
  const story = {id:'story-1',title,summary:content,content,event_fingerprint:'evt-test',status:'pending_corroboration',
    human_review_status:'required',reviewed_by:null,created_at:new Date(now-3*3600000).toISOString(),updated_at:new Date(now).toISOString(),
    ai_payload:{translation_version:ICE_TRANSLATION_VERSION,editorial_policy_version:EDITORIAL_POLICY_VERSION,
      editorial_depth:'brief',translated_to_chinese:true,old_news_checked:true,automatic_old_news_check_passed:true,
      manual_old_news_confirmation:false,lead_source_post_id:post.x_post_id,lead_source_url:post.x_url,
      reviewed_content_sha256:contentDigest(title,content),editorial_review:Object.fromEntries(
        ['single_event','grounded','sufficient','source_chain_complete','analysis_grounded','court_status_correct','fresh_event','image_grounded'].map(k=>[k,true]))}};
  return {story,post};
}

test('a reviewed sourced brief requires neither official status nor another human approval',()=>{
  const {story,post}=fixture();
  assert.equal(reviewedSourceReady(story,post),true);
  assert.equal(story.ai_payload.manual_old_news_confirmation,false);
  assert.equal(story.reviewed_by,null);
  assert.equal(reviewedSourceReady({...story,content:story.content+'修改'},post),false);
  for(const key of Object.keys(story.ai_payload.editorial_review)) {
    const changed=structuredClone(story);changed.ai_payload.editorial_review[key]=false;
    assert.equal(reviewedSourceReady(changed,post),false,key);
  }
});

test('missing or substituted sources and stale/future timestamps cannot use reviewed release',()=>{
  const now=Date.now(),{story,post}=fixture(now);
  for(const patch of [{x_url:''},{x_url:'https://x.com/other/status/2'},{x_post_id:'other'},
    {source_text:''},{source_created_at:''},{source_created_at:new Date(now-12*3600000-1).toISOString()},
    {source_created_at:new Date(now+1).toISOString()}]) assert.equal(reviewedSourceReady(story,{...post,...patch},now),false,JSON.stringify(patch));
});

test('manual locks, risks, old news and unreviewed images still stop automatic release',()=>{
  const {story,post}=fixture();
  for(const patch of [{human_review_status:'editing'},{human_review_status:'rejected'},{reviewed_by:'editor'},
    {conflict_detected:true},{privacy_risk:true},{fabrication_risk:true}]) assert.equal(reviewedSourceReady({...story,...patch},post),false);
  for(const patch of [{editorial_lock:true},{manual_override:true},{appears_old_news:true},
    {old_news_checked:false},{automatic_old_news_check_passed:false},{unconfirmed_claims:['unverified']},
    {image_count:1,image_grounding_used:false}]) assert.equal(reviewedSourceReady({...story,ai_payload:{...story.ai_payload,...patch}},post),false);
});

function database(t, initial) {
  let story=structuredClone(initial.story),article=null;
  const writes=[];
  for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']) {
    const prior=process.env[key];process.env[key]=key==='SUPABASE_URL'?'https://database.test':'test';
    t.after(()=>{if(prior===undefined)delete process.env[key];else process.env[key]=prior;});
  }
  t.mock.method(globalThis,'fetch',async(url,options={})=>{
    const u=new URL(url),table=u.pathname.split('/').at(-1),method=options.method||'GET';
    if(method==='GET') {
      if(table==='ice_stories')return Response.json([story]);
      if(table==='ice_story_evidence')return Response.json([{post_id:initial.post.id,x_post_id:initial.post.x_post_id,x_url:initial.post.x_url}]);
      if(table==='ice_posts')return Response.json([initial.post]);
      if(table==='articles')return Response.json([]);
    }
    const body=JSON.parse(options.body);writes.push({table,method,body,url:u});
    if(table==='ice_stories'&&method==='PATCH'){story={...story,...body};return Response.json([story]);}
    if(table==='articles'&&method==='POST'){article=body;return Response.json([article]);}
    throw Error(`Unexpected request ${method} ${url}`);
  });
  return {get story(){return story;},get article(){return article;},writes};
}

test('reviewed nonofficial copy moves through promotion, due selection and publication',async t=>{
  const initial=fixture(),db=database(t,initial);
  await promote();
  assert.equal(db.story.status,'approved');
  assert.equal(db.story.human_review_status,'not_required_reviewed');
  const promotion=db.writes[0];
  assert.equal(promotion.url.searchParams.get('updated_at'),`eq.${initial.story.updated_at}`);
  assert.equal(promotion.url.searchParams.get('reviewed_by'),'is.null');
  const due=await dueStories(10);assert.equal(due.length,1);
  assert.ok(await publish(due[0]));
  assert.equal(db.story.status,'published');
  assert.equal(db.article.review_status,'reviewed_source_auto_published');
  assert.equal(db.article.metadata.official_direct_publish,false);
  assert.deepEqual(db.article.metadata.editorial_review,initial.story.ai_payload.editorial_review);
  assert.equal(db.article.source_url,initial.post.x_url);
  assert.equal(db.story.reviewed_by,null);
  assert.equal(db.story.ai_payload.manual_old_news_confirmation,false);
});

test('a changed source at publication cannot reuse the promoted review',async t=>{
  const initial=fixture();
  initial.story.status='approved';initial.story.human_review_status='not_required_reviewed';
  initial.story.ai_payload.reviewed_source_auto=true;
  initial.post.x_url='https://x.com/different/status/2';
  const db=database(t,initial);
  assert.equal(await publish(initial.story),null);
  assert.equal(db.article,null);
  assert.equal(db.story.status,'pending_review');
});

test('attributed single-source news publishes without pretending independent corroboration',async t=>{
 const initial=fixture();
 const r=initial.story.ai_payload.editorial_review;
 r.source_chain_complete=false;r.independent_sources=false;
 r.attributed_source=true;r.attribution_evidence='正文准确归因至原始记者账号发布的执法消息。';
 const db=database(t,initial);
 await promote();
 const due=await dueStories(10);assert.equal(due.length,1);
 assert.ok(await publish(due[0]));
 assert.equal(db.article.metadata.editorial_review.source_chain_complete,false);
 assert.equal(db.article.metadata.editorial_review.independent_sources,false);
});
