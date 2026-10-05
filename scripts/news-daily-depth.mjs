import './news-budget-preload.mjs';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {supabase,tweetFromCandidate,qualifyTweet,generateArticle,buildPublishedArticle,publishArticle,existingArticle,recentChinaArticles,eventDuplicate,bodyCharacterCount,buildEvidencePendingArticle} from './china-hot-li-teacher-ingest.mjs';
import {sourceWithinCollectionWindow,contentDigest,DEEP_REVIEW_FIELDS,deepQualityErrors} from './news-editorial-policy.mjs';
import {compareNewsPriority} from './news-priority.mjs';
import {articleUpdateBody,automationMayUpdate,verifyArticleUpdate} from './news-article-updates.mjs';
import {isBudgetDeferred} from './news-cost-model.mjs';
import {readAllPages} from './paged-read.mjs';
import {DEPTH_PLANNING_VERSION} from './news-forward-policy.mjs';

export const DAILY_DEEP_TARGET=10;
export const DAILY_DEEP_MIN=2000;
export const nyDate=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export function countsTowardDailyDepth(row,date) {
  const m=row.metadata || {};
  return row.status==='published' && row.visibility==='public' && row.published_at && nyDate(row.published_at)===date
    && m.editorial_depth==='deep' && bodyCharacterCount(row.content)>=DAILY_DEEP_MIN
    && [...DEEP_REVIEW_FIELDS,'grounded','single_event','sufficient','analysis_grounded','depth_appropriate','court_status_correct','fresh_hot_event','source_chain_complete'].every(k=>m.editorial_review?.[k]===true)
    && m.reviewed_content_sha256===contentDigest(row.title,row.content)
    && deepQualityErrors({content:row.content,editorial_depth:'deep',daily_deep_commission:true},m.context_research,m.editorial_review).length===0;
}
export function eligibleCandidate(row,date) {
  const p=row.ai_payload || {}, tweet=tweetFromCandidate(row);
  return sourceWithinCollectionWindow(tweet.created_at) && tweet.topic_key!=='ren-zhengfei'
    && !p.manual_editor_lock && !p.manual_override && !['rejected','duplicate','deleted','legacy_archived'].includes(row.decision)
    && !(p.daily_depth_attempt?.date===date && p.daily_depth_attempt.planning_version===DEPTH_PLANNING_VERSION && p.daily_depth_attempt.attempts>=3);
}
async function dailyRows(date) {
  const rows=await readAllPages(page=>supabase('articles',{query:{select:'id,title,content,status,visibility,published_at,metadata',status:'eq.published',visibility:'eq.public',published_at:`gte.${new Date(Date.now()-48*3600000).toISOString()}`,order:'published_at.desc,id.desc',...page}}),{pageSize:100,maxRows:3000});
  return rows.filter(row=>countsTowardDailyDepth(row,date));
}
async function enabled() {
  const rows=await supabase('automation_controls',{query:{select:'control_key,enabled',control_key:'in.(global,china_hot)'}});
  return ['global','china_hot'].every(key=>rows.some(r=>r.control_key===key&&r.enabled===true));
}
export function iceDepthCandidate(story,post) {
  const p=story.ai_payload || {};
  if(!story.article_id || ['editing','approved','rejected'].includes(story.human_review_status) || story.reviewed_by || p.editorial_lock || p.manual_override || story.privacy_risk || story.fabrication_risk || story.conflict_detected)return null;
  return {id:null,ice_story_id:story.id,article_id:story.article_id,decision:'published',collected_at:post.source_created_at,
    external_id:`x:daily-depth:${post.x_post_id}`,raw_text:post.source_text,source_url:post.x_url,source_name:post.source_display_name,
    raw_payload:{source_created_at:post.source_created_at,source_username:post.source_username,source_name:post.source_display_name,media:post.media || [],source_links:[post.x_url],topic_key:'us'},
    ai_payload:{daily_depth_attempt:p.daily_depth_attempt}};
}
export async function depthCandidates(date) {
  const cutoff=new Date(Date.now()-12*3600000).toISOString();
  const rows=await readAllPages(page=>supabase('news_candidates',{query:{select:'*',pipeline:'like.china-hot-li-teacher-v*',collected_at:`gte.${cutoff}`,order:'collected_at.desc,id.desc',...page}}),{pageSize:100,maxRows:1000});
  const posts=await supabase('ice_posts',{query:{select:'*',source_created_at:`gte.${cutoff}`,order:'source_created_at.desc',limit:'100'}});
  const stories=await supabase('ice_stories',{query:{select:'*',status:'eq.published',published_at:`gte.${new Date(Date.now()-24*3600000).toISOString()}`,order:'published_at.desc',limit:'100'}});
  const seen=new Set();
  for(const story of stories){const post=posts.find(p=>p.x_post_id===story.ai_payload?.lead_source_post_id || p.event_fingerprint===story.event_fingerprint);if(!post || seen.has(story.article_id))continue;const row=iceDepthCandidate(story,post);if(row){rows.push(row);seen.add(story.article_id);}}
  return rows.filter(r=>eligibleCandidate(r,date)).sort((a,b)=>compareNewsPriority(tweetFromCandidate(a),tweetFromCandidate(b))).slice(0,60);
}
async function recordDepthAttempt(row,date,attempts,outcome) {
 if(!row.ice_story_id)return;
 const current=(await supabase('ice_stories',{query:{select:'ai_payload,updated_at,human_review_status,reviewed_by',id:`eq.${row.ice_story_id}`,limit:'1'}}))?.[0];
 if(current && !current.reviewed_by && !['editing','approved','rejected'].includes(current.human_review_status) && !current.ai_payload?.manual_override)await supabase('ice_stories',{method:'PATCH',query:{id:`eq.${row.ice_story_id}`,updated_at:`eq.${current.updated_at}`},body:{ai_payload:{...current.ai_payload,daily_depth_attempt:{date,planning_version:DEPTH_PLANNING_VERSION,attempts,...outcome}}}});
}
export async function runDailyDepth() {
  if(!await enabled())return {status:'disabled'};
  const date=nyDate(), before=await dailyRows(date);
  const report={date,timezone:'America/New_York',target:10,minimum_chinese_chars:DAILY_DEEP_MIN,before:before.length,completed:before.length,results:[],run_id:process.env.GITHUB_RUN_ID || ''};
  if(before.length>=10){console.log(JSON.stringify({...report,status:'target-met'}));return report;}
  const candidates=await depthCandidates(date);
  report.eligible_candidates=candidates.length;report.skipped=[];
  const recent=await recentChinaArticles(), deadline=Date.now()+35*60000;
  for(const row of candidates) {
    if(Date.now()>deadline || nyDate()!==date || !await enabled())break;
    report.completed=(await dailyRows(date)).length;
    if(report.completed>=10)break;
    const tweet=tweetFromCandidate(row),qualified=qualifyTweet(tweet);
    if(!qualified.accepted){report.skipped.push({candidate_id:row.id || row.ice_story_id,reason:qualified.reason});continue;}
    const prior=row.ice_story_id ? (await supabase('articles',{query:{select:'*',id:`eq.${row.article_id}`,limit:'1'}}))?.[0] : await existingArticle(tweet);
    if(prior && (prior.metadata?.manual_editor_lock || prior.metadata?.manual_override))continue;
    if(prior?.status==='published' && (nyDate(prior.published_at)!==date || !automationMayUpdate(prior) || countsTowardDailyDepth(prior,date)))continue;
    const previousAttempt=row.ai_payload?.daily_depth_attempt;
    const attempts=(previousAttempt?.date===date && previousAttempt.planning_version===DEPTH_PLANNING_VERSION ? previousAttempt.attempts : 0)+1;
    const outcome={candidate_id:row.id || row.ice_story_id,status:'started'};
    try {
      console.log(JSON.stringify({event:'daily-depth-start',date,candidate_id:row.id,title:qualified.title,remaining:10-report.completed}));
      const article=await generateArticle(qualified,tweet,0,null,'daily-deep');
      if(article.appears_old_news)throw new Error('未核实近期新进展');
      const next=buildPublishedArticle(tweet,qualified,article);
      const duplicate=await eventDuplicate(article,recent.filter(r=>r.id!==prior?.id),true);
      if(duplicate)throw new Error(`同一事件已有文章 ${duplicate.id}，不新增重复长稿`);
      if(nyDate()!==date || !await enabled() || (await dailyRows(date)).length>=10)break;
      let saved;
      if(prior?.status==='published') {
        const reason=await verifyArticleUpdate(prior,next,{request:async(url,options)=>{
          const r=await fetch(url,{...options,signal:AbortSignal.timeout(120000)});if(!r.ok)throw new Error(`更新复核 HTTP ${r.status}`);return r.json();
        }});
        if(!reason)throw new Error('深度扩展未通过原网址更新复核');
        if(nyDate()!==date || !sourceWithinCollectionWindow(tweet.created_at) || !await enabled() || (await dailyRows(date)).length>=10)break;
        const body=articleUpdateBody(prior,next,reason);
        const result=await supabase('articles',{method:'PATCH',query:{id:`eq.${prior.id}`,updated_at:`eq.${prior.updated_at}`,status:'eq.published',visibility:'eq.public'},body,prefer:'return=representation'});
        if(!result?.length)throw new Error('稿件已被其他编辑修改');saved=result[0];
      } else saved=await publishArticle(next,prior);
      if(!saved?.id || !countsTowardDailyDepth(saved,date))throw new Error('发布回读未满足每日深度验收');
      recent.unshift(saved);Object.assign(outcome,{status:prior?.status==='published'?'expanded-existing':'published',article_id:saved.id,body_chinese_chars:bodyCharacterCount(saved.content),path:saved.publication_path});
      const current=row.id ? (await supabase('news_candidates',{query:{select:'ai_payload,updated_at',id:`eq.${row.id}`,limit:'1'}}))?.[0] : null;
      if(current && !current.ai_payload?.manual_editor_lock)await supabase('news_candidates',{method:'PATCH',query:{id:`eq.${row.id}`,updated_at:`eq.${current.updated_at}`},body:{decision:'published',article_id:saved.id,proposed_section:saved.category_name,decision_reason:'每日2000–3500字深度稿已发布并回读验收',processed_at:new Date().toISOString(),ai_payload:{...current.ai_payload,daily_depth_attempt:{date,planning_version:DEPTH_PLANNING_VERSION,attempts,status:outcome.status},daily_depth_article_id:saved.id}}});
    } catch(error) {
      Object.assign(outcome,{status:isBudgetDeferred(error)?'budget-deferred':'not-published',reason:String(error.message).slice(0,700)});
      // Standing publisher instruction: insufficient depth evidence is reviewed
      // after publication; it does not turn a source report into a deep article.
      if (!isBudgetDeferred(error) && /每日深度选题资料不足|每日深度稿证据|每日深度稿独立背景资料不足/.test(String(error.message))) {
        try {
          if (prior?.status==='published') {
            await supabase('articles',{method:'PATCH',query:{id:`eq.${prior.id}`,updated_at:`eq.${prior.updated_at}`},body:{metadata:{...prior.metadata,manual_review_required:true,requires_editor_review:true,post_publication_review_status:'pending',post_publication_review_reason:outcome.reason},updated_at:new Date().toISOString()}});
            Object.assign(outcome,{status:'existing-published-pending-review',article_id:prior.id});
          } else {
            const body=await buildEvidencePendingArticle(tweet,qualified,outcome.reason);
            const duplicate=await eventDuplicate({title:body.title,content:body.content},recent,true);
            if (duplicate) Object.assign(outcome,{status:'existing-published-pending-review',article_id:duplicate.id});
            else {
              const saved=await publishArticle(body,prior);
              if(saved?.status!=='published')throw new Error('来源消息未通过发布回读');
              recent.unshift(saved);Object.assign(outcome,{status:'published-pending-review',article_id:saved.id,path:saved.publication_path});
            }
          }
        } catch(fallbackError) {outcome.fallback_error=String(fallbackError.message).slice(0,700);}
      }
      const current=row.id ? (await supabase('news_candidates',{query:{select:'ai_payload,updated_at',id:`eq.${row.id}`,limit:'1'}}))?.[0] : null;
      if(current && !current.ai_payload?.manual_editor_lock)await supabase('news_candidates',{method:'PATCH',query:{id:`eq.${row.id}`,updated_at:`eq.${current.updated_at}`},body:{...(outcome.article_id?{decision:'published',article_id:outcome.article_id,decision_reason:'已发布，资料不足留待人工后续核查',processed_at:new Date().toISOString()}:{}),ai_payload:{...current.ai_payload,...(outcome.article_id?{manual_review_required:true,post_publication_review_status:'pending'}:{}),daily_depth_attempt:{date,planning_version:DEPTH_PLANNING_VERSION,attempts,...outcome}}}});
    }
    await recordDepthAttempt(row,date,attempts,outcome);
    report.results.push(outcome);console.log(JSON.stringify({event:'daily-depth-result',...outcome}));
    if(outcome.status==='budget-deferred')break;
  }
  report.completed=(await dailyRows(date)).length;report.remaining=Math.max(0,10-report.completed);
  report.status=report.remaining?'shortfall':'target-met';
  console.log(JSON.stringify({event:'daily-depth-report',...report},null,2));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n每日深度稿（纽约 ${date}）：${report.completed}/10，正文2000–3500汉字；缺额${report.remaining}。\n\n`+report.results.map(r=>`- ${r.candidate_id}: ${r.status} ${r.reason || r.article_id || ''}`).join('\n')+'\n');
  await supabase('automation_notifications',{method:'POST',body:{control_key:'china_hot',severity:report.remaining?'warning':'success',title:`每日深度稿 ${report.completed}/10（纽约 ${date}）`,message:`已验收${report.completed}篇2000–3500字深度稿，尚缺${report.remaining}篇。${report.remaining?'现有总控下一轮继续补选；资料不足可按来源消息发布并留待人工处理，普通稿不计入深度数量。':'今日目标已完成。'}`,details:report}});
  if(report.remaining) {console.warn(`::warning title=每日深度稿未完成::${report.completed}/10，缺${report.remaining}篇；候选${report.eligible_candidates}篇，请查看逐题资料缺口`);}
  return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)runDailyDepth().catch(e=>{console.error(e);process.exitCode=1;});
