import test from 'node:test';
import assert from 'node:assert/strict';
import {EDITORIAL_POLICY_VERSION,ICE_TRANSLATION_VERSION,DEEP_REVIEW_FIELDS,contentDigest,deepQualityErrors,independentSourceCount,reviewedStoryReady,manualEditorialMetadata} from './news-editorial-policy.mjs';
import {assertBodyQuality} from './china-hot-li-teacher-ingest.mjs';
import {editorialReady as publishReady} from './ice-publish-due.mjs';
import {editorialReady as promoteReady} from './ice-trusted-source-promote.mjs';
import {isCandidate} from './ice-candidate-gate.mjs';
import {classifyNewsQuality} from './ice-news-quality-gate.mjs';
import routing from '../netlify/functions/_shared/official-content-routing.js';
import {parseOfficialFeed,allowedOfficialUrl,officialArticleText} from './ice-official-web-discovery.mjs';
import {researchEvent} from './china-context-research.mjs';
import {translate} from './ice-translate-title-body.mjs';
const source=url=>({url,kind:'web_evidence',tool_cited:true});
const research={web_search_completed:true,sources:[source('https://www.justice.gov/opa/primary'),source('https://www.reuters.com/independent')]};
const review=Object.fromEntries(['single_event','grounded','sufficient','source_chain_complete','analysis_grounded','depth_appropriate','court_status_correct','fresh_event','image_grounded',...DEEP_REVIEW_FIELDS].map(k=>[k,true]));
const official={source_type:'official',source_username:'ICEgov',trust_tier:1};
function story(chars=2000) {const title='联邦法院公布移民政策裁决',content='文'.repeat(chars);return {title,content,ai_payload:{translation_version:ICE_TRANSLATION_VERSION,editorial_policy_version:EDITORIAL_POLICY_VERSION,editorial_depth:'deep',editorial_review:review,context_research:research,reviewed_content_sha256:contentDigest(title,content),translated_to_chinese:true,old_news_checked:true,automatic_old_news_check_passed:true,appears_old_news:false}};}
test('deep limits apply at both ICE publication gates, including topic_only',()=>{
 for(const n of [1999,2000,3500,3501]) {const s=story(n);s.ai_payload.publication_scope='topic_only';assert.equal(publishReady(s,official),n>=2000&&n<=3500);assert.equal(promoteReady(s,[official]),n>=2000&&n<=3500);}
 assert.throws(()=>assertBodyQuality({editorial_depth:'deep',publication_scope:'topic_only',content:'文'.repeat(650)}),/2000/);
 assert.throws(()=>assertBodyQuality({editorial_depth:'standard',content:'文'.repeat(2000)}),/超过1999/);
});
test('two links from one publisher, social comments and unexecuted searches cannot qualify depth',()=>{
 assert.equal(independentSourceCount({sources:research.sources}),0);
 assert.equal(independentSourceCount({...research,sources:[source('https://www.reuters.com/a'),source('https://reuters.com/b'),source('https://x.com/user/status/1')]}),1);
 assert.equal(independentSourceCount({...research,sources:[source('https://ice.gov/a'),source('https://dhs.gov/b')]}),1);
 assert.equal(independentSourceCount({...research,sources:[{url:'https://example.com/comment',kind:'comment_opinion_unverified',tool_cited:true}]}),0);
});
test('each missing deep research dimension blocks publication and edits invalidate prior verdict',()=>{
 for(const key of DEEP_REVIEW_FIELDS){const s=story();s.ai_payload.editorial_review={...review,[key]:false};assert.equal(reviewedStoryReady(s),false,key);}
 const s=story();assert.equal(reviewedStoryReady(s),true);assert.equal(reviewedStoryReady({...s,content:s.content+'改'}),false);
 assert.equal(manualEditorialMetadata(s,s.title,'短讯').editorial_depth,'brief');
 assert.equal(manualEditorialMetadata(s,s.title,s.content).editorial_depth,'deep');
});
test('old unchecked official translations cannot bypass the new review but legacy human approval survives',()=>{
 const s=story(500);s.ai_payload.translation_version='zh-title-body-v10-official-context-flex-300-1500';s.ai_payload.manual_old_news_confirmation=true;
 assert.equal(publishReady(s,official),false);assert.equal(promoteReady(s,[official]),false);
 s.human_review_status='approved';s.reviewed_by='editor';assert.equal(publishReady(s,official),true);
});
test('research keeps retrieved comments separate from factual citations',async()=>{
 let calls=0;
 const result=await researchEvent({text:'source'},{id:'1',source_username:'author'},{bearer:'test',readJson:r=>r.json(),request:async()=>{
  calls++;
  return Response.json(calls===1?{data:[{id:'2',text:'This comment is only an opinion about the event.',conversation_id:'1',author_id:'other'}]}:{output:[{type:'web_search_call',status:'completed'},{content:[{type:'output_text',text:'Verified primary report',annotations:[{type:'url_citation',url:'https://www.justice.gov/primary',title:'DOJ'}]}]}]});
 }});
 assert.equal(result.thread.length,1);assert.equal(result.sources.length,1);assert.equal(independentSourceCount(result),1);
});
for(const [label,text,route] of [
 ['US policy','The White House announced new tariff rules today.','us-politics'],
 ['court','A federal court issued a preliminary injunction on immigration policy today.','us-politics'],
 ['China politics','中国国务院发布政策并宣布修订管理条例。','china'],
 ['law enforcement','The FBI announced charges against a fraud ring.','us-crime'],
 ['Chinese readers','USCIS issued a new F-1 student visa policy for Chinese students.','immigration-knowledge']
]) test(`expanded ${label} survives collection gates and routes correctly`,()=>{const row={source_text:text,source_type:'major_media'};assert.equal(isCandidate(row),true);assert.equal(classifyNewsQuality(row).keep,true);assert.equal(routing.routeOfficialContent('', '',text).key,route);});
test('unrelated, opinion-only and old uploads remain ineligible',()=>{
 for(const text of ['I hope Congress would change immigration policy.','We love ice cream.','A holiday greeting from the FBI.'])assert.equal(classifyNewsQuality({source_text:text,source_type:'official'}).keep,false,text);
});
test('official feed rejects foreign hosts, old items, missing dates and future timestamps',()=>{
 const now=Date.parse('2026-09-25T10:00:00Z');const item=(url,date)=>`<item><title>DOJ issued charges</title><link>${url}</link><pubDate>${date}</pubDate><description>Facts</description></item>`;
 const xml='<rss><channel>'+item('https://www.justice.gov/opa/a','Fri, 25 Sep 2026 00:00:00 GMT')+item('https://justice.gov.evil.test/a','Fri, 25 Sep 2026 00:00:00 GMT')+item('https://www.justice.gov/opa/b','2025-01-01')+item('https://www.justice.gov/opa/c','2027-01-01')+'</channel></rss>';
 assert.equal(parseOfficialFeed(xml,now).length,1);assert.equal(allowedOfficialUrl('https://user@justice.gov/a'),false);
 assert.equal(officialArticleText('<main><p>Original statement</p><script>invented</script></main>'),'Original statement');
});
test('ICE deep writer research is reused when missing data requires a factual downgrade',async(t)=>{
 let searches=0,writes=0,reviews=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const body=JSON.parse(options.body);
  if(body.tools){searches++;return Response.json({output:[{type:'web_search_call',status:'completed'},{content:[{type:'output_text',text:'Retrieved documents',annotations:research.sources.map(s=>({type:'url_citation',url:s.url}))}]}]});}
  if(body.text.format.name==='unified_news_review'){reviews++;return Response.json({output_text:JSON.stringify({...review,data_context:reviews!==1})});}
  writes++;return Response.json({output_text:JSON.stringify({title:'联邦法院裁定新政策暂缓执行',content:'文'.repeat(writes===1?2600:500),summary:'法院发布裁定',editorial_depth:writes===1?'deep':'brief',source_sufficient:true,depth_reason:'材料决定稿型',source_language:'en',image_observations:'',appears_old_news:false,old_news_reason:''})});
 });
 const result=await translate({},[{source_text:'A federal court issued an injunction on new immigration rules today.',x_url:'https://www.justice.gov/opa/primary'}]);
 assert.equal(searches,1);assert.equal(writes,2);assert.equal(reviews,2);assert.equal(result.editorial_depth,'brief');assert.equal(result.targetMax,799);
});
test('undersized drafts are reviewed under their actual lower tier and still require grounded facts',async(t)=>{
 let length=500,requested='standard',grounded=true,writes=0,reviewedDepth='';
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const body=JSON.parse(options.body);
  if(body.tools)return Response.json({output:[{type:'web_search_call',status:'completed'},{content:[{type:'output_text',text:'Retrieved documents',annotations:research.sources.map(s=>({type:'url_citation',url:s.url}))}]}]});
  if(body.text.format.name==='unified_news_review'){
   reviewedDepth=JSON.parse(body.input[0].content[0].text).article.editorial_depth;
   return Response.json({output_text:JSON.stringify({...review,grounded,reason:grounded?'事实有据':'缺少事实证据'})});
  }
  writes++;return Response.json({output_text:JSON.stringify({title:'联邦法院裁定新政策暂缓执行',content:'文'.repeat(length),summary:'法院发布裁定',editorial_depth:requested,source_sufficient:true,depth_reason:'仅有已核实事实',source_language:'en',image_observations:'',appears_old_news:false,old_news_reason:''})});
 });
 const posts=[{source_text:'A federal court issued an injunction on new immigration rules today.',x_url:'https://www.justice.gov/opa/primary'}];
 const brief=await translate({},posts);assert.equal(brief.editorial_depth,'brief');assert.equal(reviewedDepth,'brief');assert.equal(writes,1);
 length=1700;requested='deep';const standard=await translate({},posts);assert.equal(standard.editorial_depth,'standard');assert.equal(reviewedDepth,'standard');assert.equal(writes,3);
 length=500;grounded=false;await assert.rejects(()=>translate({},posts),/独立复核未通过/);
});

import {articleUpdateBody,automationMayUpdate,verifyArticleUpdate} from './news-article-updates.mjs';
test('same-URL updates preserve publication identity and cannot overwrite human edits',async()=>{
 const old={id:'fixed-id',slug:'fixed-slug',publication_path:'/news/fixed-slug',published_at:'2026-09-24T12:00:00Z',updated_at:'2026-09-24T12:00:00Z',status:'published',visibility:'public',title:'旧标题',content:'旧事实',review_status:'official_source_auto_published',metadata:{reviewed_content_sha256:contentDigest('旧标题','旧事实')}};
 assert.equal(automationMayUpdate(old),true);
 for(const extra of [{manual_override:true},{editorial_lock:true},{human_category_override:'美国时政'},{reviewed_by:'editor'}])assert.equal(automationMayUpdate({...old,metadata:{...old.metadata,...extra}}),false);
 assert.equal(automationMayUpdate({...old,content:'编辑修改'}),false);
 const next={title:'新标题',summary:'新进展',content:'旧事实和有来源的新事实',source_url:'https://www.justice.gov/new',metadata:{editorial_depth:'brief'}};
 const patch=articleUpdateBody(old,next,'新法院裁定','2026-09-25T12:00:00Z');
 for(const field of ['id','slug','publication_path','published_at','source_url','category_name'])assert.equal(Object.hasOwn(patch,field),false,field);
 assert.equal(patch.metadata.original_published_at,old.published_at);assert.equal(patch.metadata.content_updated_at,'2026-09-25T12:00:00Z');
 assert.equal(await verifyArticleUpdate(old,next,{request:async()=>({output_text:'{"approve":false,"reason":"只有改写"}'})}),false);
});
test('human approval of an edited policy story remains publishable but loses unchecked depth label',()=>{
 const s=story();s.human_review_status='approved';s.reviewed_by='editor';s.ai_payload.manual_old_news_confirmation=true;s.content='编辑核验后的短讯';
 assert.equal(publishReady(s,official),true);assert.equal(manualEditorialMetadata(s,s.title,s.content).editorial_depth,'brief');
});

import {isOlderThanCutoff} from './ice-drop-stale-posts.mjs';
test('official websites obey the same strict 12-hour limit as social sources',()=>{
 const now=Date.parse('2026-09-25T02:00:00Z'),cutoff=now-12*3600000;
 const release={source_created_at:'2026-09-24T12:00:00Z',source_type:'official',trust_tier:1,raw_payload:{source_platform:'official_web'},x_url:'https://www.justice.gov/opa/release'};
 assert.equal(isOlderThanCutoff(release,cutoff,now),true);
 assert.equal(isOlderThanCutoff({...release,source_created_at:'2026-09-24T15:00:00Z'},cutoff,now),false);
 assert.equal(parseOfficialFeed('<rss><item><title>Official release</title><link>https://www.justice.gov/opa/release</link><pubDate>2026-09-24T12:00:00Z</pubDate></item></rss>',now).length,0);
 assert.equal(isOlderThanCutoff({...release,raw_payload:{source_platform:'x'}},cutoff,now),true);
 assert.equal(isOlderThanCutoff({...release,trust_tier:2},cutoff,now),true);
 assert.equal(isOlderThanCutoff({...release,x_url:'https://justice.gov.evil.test/release'},cutoff,now),true);
 assert.equal(isOlderThanCutoff({...release,source_created_at:'2026-09-24T01:00:00Z'},cutoff,now),true);
});

import {candidateRoutes} from './ice-trusted-source-promote.mjs';
test('nonofficial political and court candidates retain their route without gaining official approval',()=>{
 const story={title:'美国联邦法院发布新裁定',summary:'法官宣布新政策暂缓执行',content:'美国联邦法院发布关于移民政策的裁定。'};
 const media={source_type:'major_media',source_username:'Reuters',trust_tier:2,source_text:'A federal court issued a new injunction on immigration policy.'};
 const routes=candidateRoutes(story,[media]);assert.equal(routes.candidate.key,'us-politics');assert.equal(routes.official,null);
 const officialRoutes=candidateRoutes(story,[{...media,source_type:'official',trust_tier:1}]);assert.equal(officialRoutes.official.key,'us-politics');
});

import {sourceWithinCollectionWindow} from './news-editorial-policy.mjs';
test('source freshness uses original time and fails closed outside twelve hours',()=>{
 const now=Date.parse('2026-09-25T02:00:00Z');
 assert.equal(sourceWithinCollectionWindow('2026-09-24T14:00:00Z',now),true);
 for(const time of ['2026-09-24T13:59:59Z','2026-09-25T02:00:01Z','',null])assert.equal(sourceWithinCollectionWindow(time,now),false);
});

test('a deep-report suitability flag cannot reject a factual lower-tier copy or bypass factual gates',()=>{
 for(const [depth,n] of [['brief',500],['standard',900]]){
  const s=story(n);s.ai_payload.editorial_depth=depth;
  s.ai_payload.editorial_review={...review,depth_appropriate:false,...Object.fromEntries(DEEP_REVIEW_FIELDS.map(k=>[k,false]))};
  assert.equal(reviewedStoryReady(s),true);
  assert.equal(s.ai_payload.editorial_review.depth_appropriate,false,'retain the actual review instead of fabricating approval');
  for(const key of ['grounded','sufficient','source_chain_complete','court_status_correct','fresh_event','analysis_grounded'])
   assert.equal(reviewedStoryReady({...s,ai_payload:{...s.ai_payload,editorial_review:{...s.ai_payload.editorial_review,[key]:false}}}),false,key);
 }
 const deep=story();deep.ai_payload.editorial_review={...review,depth_appropriate:false};assert.equal(reviewedStoryReady(deep),false);
});

test('ICE writer accepts a factual brief when the reviewer only objects to missing depth',async t=>{
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const request=JSON.parse(options.body);
  if(request.tools)return Response.json({output:[]});
  if(request.text.format.name==='unified_news_review')return Response.json({output_text:JSON.stringify({...review,depth_appropriate:false,reason:'事实与简讯篇幅合格，但没有深度分析',...Object.fromEntries(DEEP_REVIEW_FIELDS.map(k=>[k,false]))})});
  return Response.json({output_text:JSON.stringify({title:'执法部门公布案件进展',summary:'通报已确认的案件事实',content:'文'.repeat(500),editorial_depth:'brief',source_sufficient:true,depth_reason:'仅有已核实事实',source_language:'en',image_observations:'',appears_old_news:false,old_news_reason:''})});
 });
 const result=await translate({},[{source_text:'Police announced an arrest and released the case facts today.',source_created_at:new Date().toISOString()}]);
 assert.equal(result.editorial_depth,'brief');assert.equal(result.editorial_review.depth_appropriate,false);
});
