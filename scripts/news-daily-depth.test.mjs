import test from 'node:test';
import assert from 'node:assert/strict';
import {nyDate,countsTowardDailyDepth,eligibleCandidate,runDailyDepth} from './news-daily-depth.mjs';
import {contentDigest,DEEP_REVIEW_FIELDS,deepQualityErrors} from './news-editorial-policy.mjs';
import {qualifyTweet,resolvePublicationRoute,generateArticle,buildPublishedArticle} from './china-hot-li-teacher-ingest.mjs';
const review=Object.fromEntries([...DEEP_REVIEW_FIELDS,'grounded','single_event','sufficient','analysis_grounded','depth_appropriate','court_status_correct','fresh_hot_event','source_chain_complete'].map(k=>[k,true]));
const research={web_search_completed:true,sources:['https://www.justice.gov/opa/report','https://www.reuters.com/world/report'].map(url=>({url,kind:'web_evidence',tool_cited:true})),depth_assignment:{requested_depth:'deep',sections:[]}};
function row(n=3500){const r={title:'纽约检察官公布调查进展',content:'文'.repeat(n),status:'published',visibility:'public',published_at:'2026-10-01T04:00:00Z',metadata:{editorial_depth:'deep',context_research:research,editorial_review:{...review}}};r.metadata.reviewed_content_sha256=contentDigest(r.title,r.content);return r;}
test('daily acceptance uses New York midnight, including winter offset',()=>{
 assert.equal(nyDate('2026-10-01T03:59:59Z'),'2026-09-30');
 assert.equal(nyDate('2026-10-01T04:00:00Z'),'2026-10-01');
 assert.equal(nyDate('2026-12-01T04:59:59Z'),'2026-11-30');
 assert.equal(nyDate('2026-12-01T05:00:00Z'),'2026-12-01');
 assert.equal(countsTowardDailyDepth(row(),'2026-10-01'),true);
 assert.equal(countsTowardDailyDepth(row(3499),'2026-10-01'),false);
 assert.equal(countsTowardDailyDepth(row(),'2026-09-30'),false);
});
test('drafts, edited bodies and incomplete factual reviews never count',()=>{
 for(const change of [r=>r.status='draft',r=>r.visibility='private',r=>r.content+='新增内容',r=>r.metadata.editorial_review.data_verified=false,r=>r.metadata.editorial_depth='standard']){const r=row();change(r);assert.equal(countsTowardDailyDepth(r,'2026-10-01'),false);}
 const r=row(3499);r.content='<p>'+r.content+'</p><script>这是脚本不能计数</script>';r.metadata.reviewed_content_sha256=contentDigest(r.title,r.content);assert.equal(countsTowardDailyDepth(r,'2026-10-01'),false);
});
test('daily deep limits do not silently raise ordinary news limits',()=>{
 const article={content:'文'.repeat(3800),editorial_depth:'deep',editorial_review:review};
 assert.ok(deepQualityErrors(article,research).length);
 assert.deepEqual(deepQualityErrors({...article,daily_deep_commission:true},research),[]);
 assert.ok(deepQualityErrors({...article,content:'文'.repeat(3499),daily_deep_commission:true},research).length);
});
test('candidate retries preserve 12-hour window, human locks and bounded attempts',()=>{
 const r={external_id:'x:li-teacher:123',raw_text:'中国新闻',collected_at:new Date().toISOString(),raw_payload:{source_created_at:new Date().toISOString()},ai_payload:{},decision:'failed'};
 const date=nyDate();assert.equal(eligibleCandidate(r,date),true);
 for(const change of [x=>x.raw_payload.source_created_at=new Date(Date.now()-13*3600000).toISOString(),x=>x.ai_payload.manual_editor_lock=true,x=>x.ai_payload.manual_override=true,x=>x.decision='rejected',x=>x.ai_payload.daily_depth_attempt={date,attempts:3}]){const x=structuredClone(r);change(x);assert.equal(eligibleCandidate(x,date),false);}
});
test('source-led routing accepts Cornell, Tibet and Tennessee without foreign background relocating event',()=>{
 const cases=[['纽约检察官重启康奈尔大学性侵案调查','康奈尔大学案件获重新审查','us-enforcement'],['中国当局在西藏部署无人机，英国议员讨论采购限制','西藏无人机部署引发关注','china'],['美国田纳西州死刑执行受到质疑','田纳西州死刑程序接受审查','us-enforcement']];
 for(const [text,title,expected] of cases){const q=qualifyTweet({id:'1',text});assert.equal(q.accepted,true);assert.equal(resolvePublicationRoute(q,{title,content:text}),expected);}
 assert.equal(resolvePublicationRoute({accepted:false,route:'china'},{title:'中国新闻',content:''}),'');
});
test('daily writer and independent reviewer receive the same target and publish a reviewed long body',async(t)=>{
 const tweet={id:'123',created_at:new Date().toISOString(),text:'中国教育部门公布学校招生政策并回应学生意见。',media:[],image_lookup_attempted:true,context_research_attempted:true,context_research:research};
 const content='中国教育部门公布招生政策。'+Array.from({length:3800},(_,i)=>String.fromCharCode(0x4e00+i)).join('');
 let writes=0,reviews=0;
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const input=JSON.parse(options.body),isReview=input.text.format.name==='china_hot_editorial_review';
  if(isReview){reviews++;const data=JSON.parse(input.input[0].content[0].text);assert.equal(data.daily_deep_commission,true);return Response.json({output_text:JSON.stringify({...review,cover_index:-1,image_relevant:false,image_description:'',reason:'材料支持'})});}
  writes++;assert.match(input.instructions,/3500至5000/);return Response.json({output_text:JSON.stringify({title:'中国教育部门公布招生政策',summary:'教育部门回应学生提出的招生问题',content,editorial_depth:'deep',source_sufficient:true,appears_old_news:false,analysis_angles:[],seo_keywords:'教育',depth_reason:'有依据的政策分析'})});
 });
 const q=qualifyTweet(tweet),article=await generateArticle(q,tweet,0,null,'daily-deep');
 const saved={id:1,...buildPublishedArticle(tweet,q,article)};
 assert.equal(countsTowardDailyDepth(saved,nyDate()),true);assert.equal(writes,1);assert.ok(reviews>=1);
});
test('controller stops at ten accepted public articles without spending on another candidate',async(t)=>{
 const old=process.env.SUPABASE_URL;process.env.SUPABASE_URL='https://database.test';t.after(()=>{if(old===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old;});
 const rows=Array.from({length:10},(_,i)=>({...row(),id:i,published_at:new Date().toISOString()}));
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(options.method,'GET');const path=new URL(url).pathname;if(path.endsWith('/automation_controls'))return Response.json([{control_key:'global',enabled:true},{control_key:'china_hot',enabled:true}]);assert.ok(path.endsWith('/articles'));return Response.json(rows);});
 const result=await runDailyDepth();assert.equal(result.completed,10);assert.deepEqual(result.results,[]);
});
