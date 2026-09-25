import test from 'node:test';
import assert from 'node:assert/strict';
import {isChinaPolitical,editorialTopics,POLITICS_FILTER} from '../netlify/shared/editorial-topics.mjs';
import {buildCandidate,generateArticle,qualifyTweet,buildPublishedArticle,sourceFor,parseModelJson,eventDuplicate} from './china-hot-li-teacher-ingest.mjs';
import {collectChinaMediaPosts,CHINA_X_SOURCES,CHINA_X_MONITORS,chinaMediaQuery,politicalReviewReason} from './china-x-sources.mjs';
const body='重庆学校发布开学通知。'+Array.from({length:630},(_,i)=>String.fromCharCode(0x4e00+i)).join('');
const source={id:'12345',text:'重庆学校今日公布开学安排，通知说明报到时间及校方调整安排。',created_at:new Date().toISOString(),media:[{type:'photo',url:'https://pbs.twimg.com/media/test.jpg'}]};
const draft={title:'重庆学校公布开学安排',summary:'学校通知载明报到时间与调整安排。',content:body,source_sufficient:true,appears_old_news:false,old_news_reason:'',rejection_reason:'',seo_keywords:'重庆,开学',image_evidence:[{image_index:0,visible_text:'开学通知'}]};
const verdict={single_event:true,grounded:true,sufficient:true,image_relevant:true,court_status_correct:true,depth_appropriate:true,analysis_grounded:true,source_chain_complete:true,cover_index:0,image_description:'学校开学通知截图',fresh_hot_event:true,freshness_evidence:'原帖及学校通知明确是今日公布的新安排',reason:''};
test('politics excludes community activity, corporate/school trivia and foreign personnel news',()=>{
 for(const title of ['王岐山大秘毕井泉受贿案宣判','薄熙来近况传闻引发议论','张又侠相关军队政变传闻待核实','应急管理部原党委书记、部长王祥喜被开除党籍','省委书记履新','习近平出席政治局会议']) assert.equal(isChinaPolitical({title}),true,title);
 for(const title of ['洛杉矶华人招募参加习近平访美欢迎活动','中共统战部在大连举办民营企业美食节','牡丹江企业欠薪引发关注','高中教学楼安装栅栏','美国部长任命公布','台湾官员落马','重庆副市长被开除党籍','某县党委书记被查','康威市长疑似被ICE误捕传闻尚未证实','ICE扩招压力引爆审查危机！17年资深官员揭招聘内幕','厦门城市职业学院南校区楼梯口墙面贴习近平重要讲话摘录','上海因私出入境服务行业协会召开会议研讨国务院出入境新规']) assert.equal(isChinaPolitical({title}),false,title);
 assert.deepEqual(editorialTopics({title:'洛杉矶华人招募参加习近平访美欢迎活动'}),['xi']);
 assert.ok(encodeURIComponent(POLITICS_FILTER).length<7500);
});
test('homepage screenshot: US titles and summaries do not create China political membership',()=>{
 const rows=[
 {title:'马西提出8项弹劾条款，五角大楼迅速回应力挺赫格塞斯',summary:'肯塔基州共和党众议员提出针对国防部长的条款，指控违反战争权力决议。'},
 {title:'布兰奇回应小特朗普婚礼资金争议，司法部不太可能调查',summary:'美国司法部长表示目前不太可能启动调查。'},
 {title:'特朗普移民政策遭司法阻击！穆林公开怒批奥巴马、拜登任命法官',summary:'美国国土安全部长批评部分法官。'},
 {title:'英国国防部长被调查',summary:'英国国防部宣布调查部长。'}
 ];
 for(const row of rows)assert.equal(isChinaPolitical(row),false,row.title);
 assert.equal(isChinaPolitical({title:'中共中央办公厅主任出席重要会议'}),true);
 assert.equal(isChinaPolitical({title:'重庆市长获任新职'}),false); // Unknown event phrasing fails conservatively.
 assert.equal(isChinaPolitical({title:'重庆市长调任'}),true);
 assert.equal(isChinaPolitical({title:'美国议员批评习近平政策'}),true);
});
test('630-character grounded article publishes in topic only without an 800-character rewrite',async t=>{
 let writes=0,reviews=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{const input=JSON.parse(options.body);assert.equal(input.tools,undefined);if(input.text.format.name==='china_hot_editorial_review'){reviews++;return Response.json({output_text:JSON.stringify(verdict)});}writes++;assert.match(input.instructions,/600至1999/);return Response.json({output_text:JSON.stringify(draft)});});
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

test('targeted source search covers named leaders and holds social/health/coup leads for review',async()=>{
 for(const source of [...CHINA_X_SOURCES,...CHINA_X_MONITORS]) {const q=chinaMediaQuery(source);assert.ok(q.length<512);assert.match(q,/李强/);assert.match(q,/省委书记/);}
 assert.ok(CHINA_X_SOURCES.some(s=>s.handle==='VOAChinese'));
 assert.ok(politicalReviewReason({source_username:'WanjunXie',text:'习近平被送医的说法'}));
 assert.ok(politicalReviewReason({source_username:'chinesehotnews',text:'各派达成共识'}));
 assert.ok(politicalReviewReason({source_username:'bbcchinese',text:'网传习近平病危'}));
 assert.equal(politicalReviewReason({source_username:'bbcchinese',text:'省委书记任免公告'}),'');
 await assert.rejects(generateArticle(qualifyTweet(source),{...source,source_username:'WanjunXie'}),/政治线索待核查/);
 const tweets=await collectChinaMediaPosts({includeMonitors:true,bearer:'test',mediaFor:()=>[],readJson:r=>r.json(),request:async url=>{
  const handle=new URL(url).searchParams.get('query').match(/^from:(\w+)/)[1];return Response.json({data:[{id:handle,author_id:'x',text:'习近平政治动态'}],includes:{users:[{id:'x',username:handle}]}});
 }});
 assert.equal(tweets.filter(t=>t.requires_editor_review).length,2);
 assert.ok(tweets.filter(t=>t.requires_editor_review).every(t=>t.source_level==='social_monitor'));
});

test('defense meeting and Taiwan arms story are collected and published under US politics, not China', async t => {
 const texts=[
  '德国国防部长皮斯托里乌斯与美国战争部长赫格塞斯在华盛顿会晤，讨论跨大西洋合作和武器产量。',
  '美国军售台湾的MQ-9B海上卫士无人机9月14日在台湾东部首次飞行测试，将用于情报、监视和侦察中国军舰及海警船。'
 ];
 for(const text of texts){
  const tweet={...source,text,source_username:'bbcchinese',source_name:'BBC News 中文'};
  const q=qualifyTweet(tweet);assert.equal(q.accepted,true);assert.equal(q.route,'us-politics');
  const article={...draft,title:text.split('，')[0],summary:'两国部长讨论军工合作与供给安排。',content:text+body,publication_scope:'topic_only',editorial_review:verdict};
  const row=buildPublishedArticle(tweet,q,article);
  assert.equal(row.category_name,'美国时政');assert.equal(row.primary_section,'美国时政');assert.equal(row.topic_key,'us-politics');
  assert.deepEqual(row.related_sections,['美国时政']);assert.deepEqual(row.metadata.editorial_topics,[]);assert.equal(row.metadata.china_politics_eligible,false);assert.equal(row.metadata.source_category_qualified,false);
 }
 assert.equal(qualifyTweet({...source,text:'习近平会见美国国防部长，双方讨论军事沟通。'}).route,'china');
 assert.equal(qualifyTweet({...source,text:'台海解放军与台湾军舰发生近距离接触。'}).route,'china');
 assert.equal(qualifyTweet({...source,text:'美国餐厅推出周末美食优惠。'}).accepted,false);
});

test('US copy completes the same writer and independent review, preserving real attribution',async t=>{
 const tweet={...source,text:'美国国防部长赫格塞斯与德国国防部长会晤，讨论北约国防合作。'};
 const generated={...draft,title:'美德国防部长讨论北约合作',summary:'双方围绕武器供应与联合生产进行交流。',content:'美国国防部长赫格塞斯与德国国防部长举行会谈。'+body};
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const input=JSON.parse(options.body);
  if(input.text.format.name==='china_hot_editorial_review'){
    assert.match(input.instructions,/虚构媒体、内部人员、知情人士/);
    return Response.json({output_text:JSON.stringify(verdict)});
  }
  assert.match(input.instructions,/600至1999/);assert.match(input.instructions,/普通账号只能写某账号发文称/);
  return Response.json({output_text:JSON.stringify(generated)});
 });
 const q=qualifyTweet(tweet);const article=await generateArticle(q,tweet);
 assert.equal(buildPublishedArticle(tweet,q,article).category_name,'美国时政');
});

test('oversize output cannot be published and fresh rejected routing records alone can retry',async()=>{
 const {assertPublicationQuality,shouldRetryCandidate}=await import('./china-hot-li-teacher-ingest.mjs');
 const long='美国国防部长举行会谈。'+Array.from({length:3501},(_,i)=>String.fromCharCode(0x4e00+i)).join('');
 assert.throws(()=>assertPublicationQuality(source,{...draft,content:long,editorial_review:verdict}),/超过1999/);
 const now=Date.now();const q=qualifyTweet({...source,text:'美国国防部长在华盛顿会见德国国防部长。'});
 const row={decision:'rejected',article_id:null,collected_at:new Date(now).toISOString(),decision_reason:'自动分类过滤：不属于中国热门头条栏目；未创建或发布文章',ai_payload:{status:'filtered',filter_reason:'outside-china-hot'}};
 assert.equal(shouldRetryCandidate(row,q,now),true);
 for(const patch of [{decision_reason:'人工拒绝'},{article_id:'published'},{collected_at:new Date(now-73*3600000).toISOString()},{decision:'duplicate'}])assert.equal(shouldRetryCandidate({...row,...patch},q,now),false);
});

test('后台PDF中的可用报道分流，无关旅游天气娱乐和广告不入队',()=>{
 const routes=[
 ['美军参谋长联席会议主席凯恩说，美军还需准备好在月球周边空间作战。','us-politics'],
 ['美国已确认在地球轨道部署了一种太空武器。','us-politics'],
 ['美国政府暂停全球部分的移民签证面谈，原因与重新评估申请人的经济能力和公共负担有关。','us-politics'],
 ['美国海岸警卫队证实，美国军方人员和联邦调查局(FBI)特工登上一艘驶往得克萨斯州的油轮，以调查网络攻击事件。','us-enforcement'],
 ['CNN报道，在美国佐治亚州移民执法突击行动中被拘留的300多名韩国工人正向美国政府发起法律挑战。','ice'],
 ['美国全国广播公司(NBC)直升机在报道致命巴士事故时坠毁并起火，造成三人丧生。','us-enforcement'],
 ['里基茨参议员：美中是竞争关系，美国应减少对华供应链依赖并支持台湾。','us-politics'],
 ['Taiwan Digital Minister visited Washington and met United States officials to discuss cybersecurity.','us-politics'],
 ['胡塞武装疑似袭击中资一带一路炼油厂，有工作人员撤离。','china']
 ];
 for(const [text,route] of routes){const q=qualifyTweet({...source,text,source_username:'bbcchinese'});assert.equal(q.accepted,true,text);assert.equal(q.route,route,text);const row=buildCandidate({...source,text},q);assert.ok(row.proposed_section);}
 for(const text of ['韩国约有8700座山，步道完善，装备齐全便可自行上山。','A northeasterly wind system will affect Taiwan, bringing mild temperatures and rain.','医疗专业人士表示，讲述美国医院急症室的剧集The Pitt是最真实的医疗剧。','美国餐厅推出周末美食优惠。','Shares of Taiwan Semiconductor Manufacturing Co. returned to their prior ex-dividend level.','Shares in Taiwan closed higher ahead of a U.S. Federal Reserve policy decision.']) assert.equal(qualifyTweet({...source,text,source_username:'Focus_Taiwan'}).accepted,false,text);
});

test('美国警情成稿和草稿都保留正确栏目，跨栏目改写无法发布',()=>{
 const tweet={...source,text:'美国联邦调查局FBI调查得克萨斯州油轮网络攻击事件。'};
 const q=qualifyTweet(tweet);
 const article={...draft,title:tweet.text,content:tweet.text+body,publication_scope:'topic_only',editorial_review:verdict};
 const row=buildPublishedArticle(tweet,q,article);
 assert.equal(row.category_name,'美国警情');assert.equal(row.topic_key,'us-enforcement');assert.equal(row.metadata.china_politics_eligible,false);
 assert.throws(()=>buildPublishedArticle(tweet,q,{...article,title:'美国国防部长会谈',content:'美国国防部长会谈。'+body}),/栏目不一致/);
});

import {matchesCollectedRoute} from './china-hot-li-teacher-ingest.mjs';
test('bilateral reporting keeps the collected route when the headline leads with a different president',()=>{
 const source='9月24日，美国华盛顿特区白宫外的拉法耶特广场，抗议者殴打一个习近平沙袋。';
 assert.equal(matchesCollectedRoute('us-politics','习近平访美期间白宫外出现抗议活动','9月24日，美国华盛顿白宫外，示威者举行针对中国国家主席习近平的抗议活动。',source),true);
 assert.equal(matchesCollectedRoute('us-politics','中国国务院发布国内政策','中国国务院宣布实施政策。',source),false);
 assert.equal(matchesCollectedRoute('us-politics','美国警方拘捕涉嫌诈骗人员','FBI逮捕一名嫌疑人。',source),false);
 assert.equal(matchesCollectedRoute('us-politics','习近平访美与特朗普举行会谈','中国领导人在美国参加会谈。','美国国会讨论联邦预算。'),false);
});
