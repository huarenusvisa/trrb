import test from 'node:test';
import assert from 'node:assert/strict';
import {isChinaPolitical,editorialTopics,POLITICS_FILTER} from '../netlify/shared/editorial-topics.mjs';
import {generateArticle,qualifyTweet,buildPublishedArticle,sourceFor,parseModelJson,eventDuplicate} from './china-hot-li-teacher-ingest.mjs';
import {collectChinaMediaPosts,CHINA_X_SOURCES} from './china-x-sources.mjs';
const body='重庆学校发布开学通知。'+Array.from({length:430},(_,i)=>String.fromCharCode(0x4e00+i)).join('');
const source={id:'12345',text:'重庆学校今日公布开学安排，通知说明报到时间及校方调整安排。',created_at:new Date().toISOString(),media:[{type:'photo',url:'https://pbs.twimg.com/media/test.jpg'}]};
const draft={title:'重庆学校公布开学安排',summary:'学校通知载明报到时间与调整安排。',content:body,source_sufficient:true,appears_old_news:false,old_news_reason:'',rejection_reason:'',seo_keywords:'重庆,开学',image_evidence:[{image_index:0,visible_text:'开学通知'}]};
const verdict={single_event:true,grounded:true,sufficient:true,image_relevant:true,cover_index:0,image_description:'学校开学通知截图',fresh_hot_event:true,freshness_evidence:'原帖及学校通知明确是今日公布的新安排',reason:''};
test('politics excludes community activity, corporate/school trivia and foreign personnel news',()=>{
 for(const title of ['王岐山大秘毕井泉受贿案宣判','薄熙来近况传闻引发议论','张又侠相关军队政变传闻待核实','重庆副市长被开除党籍','省委书记履新','习近平出席政治局会议']) assert.equal(isChinaPolitical({title}),true,title);
 for(const title of ['洛杉矶华人招募参加习近平访美欢迎活动','中共统战部在大连举办民营企业美食节','牡丹江企业欠薪引发关注','高中教学楼安装栅栏','美国部长任命公布','台湾官员落马']) assert.equal(isChinaPolitical({title}),false,title);
 assert.deepEqual(editorialTopics({title:'洛杉矶华人招募参加习近平访美欢迎活动'}),['xi']);
 assert.ok(encodeURIComponent(POLITICS_FILTER).length<7500);
});
test('430-character grounded article publishes in topic only without an 800-character rewrite',async t=>{
 let writes=0,reviews=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{const input=JSON.parse(options.body);assert.equal(input.tools,undefined);if(input.text.format.name==='china_hot_editorial_review'){reviews++;return Response.json({output_text:JSON.stringify(verdict)});}writes++;assert.match(input.instructions,/300至600/);return Response.json({output_text:JSON.stringify(draft)});});
 const qualified=qualifyTweet(source);const article=await generateArticle(qualified,{...source});const row=buildPublishedArticle(source,qualified,article);
 assert.equal(writes,1);assert.equal(reviews,1);assert.equal(row.status,'published');assert.equal(row.metadata.publication_scope,'topic_only');assert.equal(row.metadata.homepage_focus_override,'exclude');assert.deepEqual(row.metadata.image_evidence,draft.image_evidence);
});
test('incomplete JSON is regenerated once and partial content is never published',async t=>{
 let writes=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{const input=JSON.parse(options.body);if(input.text.format.name==='china_hot_editorial_review')return Response.json({output_text:JSON.stringify(verdict)});writes++;return Response.json(writes===1?{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output_text:'{"content":"unfinished'}:{status:'completed',output_text:JSON.stringify(draft)});});
 const article=await generateArticle(qualifyTweet(source),{...source});assert.equal(writes,2);assert.equal(article.content,body);
 assert.throws(()=>parseModelJson({status:'incomplete',output_text:'{"content":"valid but incomplete"}'}),/未完成/);
});
test('X media lookup verifies returned author and preserves images, source and original links',async()=>{
 const tweets=await collectChinaMediaPosts({bearer:'test',mediaFor:()=>[],readJson:r=>r.json(),request:async url=>{
 const handle=new URL(url).searchParams.get('query').match(/^from:(\w+)/)[1];
 return Response.json({data:[{id:handle,author_id:'yes',text:'China report',entities:{urls:[{expanded_url:'https://example.com/report',images:[{url:'https://pbs.twimg.com/original.jpg'}]}]}},{id:'impersonator',author_id:'no',text:'China report'}],includes:{users:[{id:'yes',username:handle},{id:'no',username:'unrelated'}]}});
 }});
 assert.equal(tweets.length,CHINA_X_SOURCES.length);assert.ok(tweets.every(t=>t.source_level==='publisher_account'&&t.media.length===1));
 assert.equal(sourceFor({...source,source_username:'BBCChinese',source_name:'BBC News 中文'}).externalId,'x:bbcchinese:12345');
 assert.equal(sourceFor(source).externalId,'x:whyyoutouzhele:12345');
});
test('cross-source dedupe checks facts and allows substantive follow-up',async t=>{
 const prior={id:'prior',title:'河南超市购物卡风波，董事长作出承诺',summary:'河南超市购物卡兑付风波，董事长写下保证书。',content:'原报道'};
 const current={title:'河南超市购物卡事件后续，储户再次聚集',summary:'河南超市购物卡兑付风波，储户再次聚集并质疑方案。',content:'材料明确记载次日再次聚集的新行动。'};
 let duplicate='';t.mock.method(globalThis,'fetch',async()=>Response.json({output_text:JSON.stringify({duplicate_id:duplicate,reason:duplicate?'同一事件仅更换媒体':'输入记载次日的新行动'})}));
 assert.equal(await eventDuplicate(current,[prior]),null);duplicate='prior';assert.equal((await eventDuplicate(current,[prior])).id,'prior');
});
