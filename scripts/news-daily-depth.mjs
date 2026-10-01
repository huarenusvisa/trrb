import './news-budget-preload.mjs';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {supabase,tweetFromCandidate,qualifyTweet,generateArticle,buildPublishedArticle,publishArticle,existingArticle,recentChinaArticles,eventDuplicate,bodyCharacterCount} from './china-hot-li-teacher-ingest.mjs';
import {sourceWithinCollectionWindow,contentDigest,DEEP_REVIEW_FIELDS,deepQualityErrors} from './news-editorial-policy.mjs';
import {compareNewsPriority} from './news-priority.mjs';
import {articleUpdateBody,automationMayUpdate,verifyArticleUpdate} from './news-article-updates.mjs';
import {isBudgetDeferred} from './news-cost-model.mjs';
import {readAllPages} from './paged-read.mjs';

export const DAILY_DEEP_TARGET=10;
export const DAILY_DEEP_MIN=3500;
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
    && !p.manual_editor_lock && !p.manual_override && !['rejected','duplicate','legacy_archived'].includes(row.decision)
    && !(p.daily_depth_attempt?.date===date && p.daily_depth_attempt.attempts>=2);
}
async function dailyRows(date) {
  const rows=await readAllPages(page=>supabase('articles',{query:{select:'id,title,content,status,visibility,published_at,metadata',status:'eq.published',visibility:'eq.public',published_at:`gte.${new Date(Date.now()-48*3600000).toISOString()}`,order:'published_at.desc,id.desc',...page}}),{pageSize:100,maxRows:3000});
  return rows.filter(row=>countsTowardDailyDepth(row,date));
}
async function enabled() {
  const rows=await supabase('automation_controls',{query:{select:'control_key,enabled',control_key:'in.(global,china_hot)'}});
  return ['global','china_hot'].every(key=>rows.some(r=>r.control_key===key&&r.enabled===true));
}
export async function runDailyDepth() {
  if(!await enabled())return {status:'disabled'};
  const date=nyDate(), before=await dailyRows(date);
  const report={date,timezone:'America/New_York',target:10,minimum_chinese_chars:3500,before:before.length,completed:before.length,results:[],run_id:process.env.GITHUB_RUN_ID || ''};
  if(before.length>=10){console.log(JSON.stringify({...report,status:'target-met'}));return report;}
  const rows=await supabase('news_candidates',{query:{select:'*',pipeline:'like.china-hot-li-teacher-v*',collected_at:`gte.${new Date(Date.now()-12*3600000).toISOString()}`,order:'collected_at.desc,id.desc',limit:'200'}});
  const candidates=rows.filter(r=>eligibleCandidate(r,date)).sort((a,b)=>compareNewsPriority(tweetFromCandidate(a),tweetFromCandidate(b))).slice(0,20);
  const recent=await recentChinaArticles(), deadline=Date.now()+35*60000;
  for(const row of candidates) {
    if(Date.now()>deadline || nyDate()!==date || !await enabled())break;
    report.completed=(await dailyRows(date)).length;
    if(report.completed>=10)break;
    const tweet=tweetFromCandidate(row),qualified=qualifyTweet(tweet);
    if(!qualified.accepted || qualified.route==='ice')continue; // ICE retains its own publication gate.
    const prior=await existingArticle(tweet);
    if(prior && (prior.metadata?.manual_editor_lock || prior.metadata?.manual_override))continue;
    if(prior?.status==='published' && (nyDate(prior.published_at)!==date || !automationMayUpdate(prior) || countsTowardDailyDepth(prior,date)))continue;
    const attempts=(row.ai_payload?.daily_depth_attempt?.date===date?row.ai_payload.daily_depth_attempt.attempts:0)+1;
    const outcome={candidate_id:row.id,status:'started'};
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
      const current=(await supabase('news_candidates',{query:{select:'ai_payload,updated_at',id:`eq.${row.id}`,limit:'1'}}))?.[0];
      if(current && !current.ai_payload?.manual_editor_lock)await supabase('news_candidates',{method:'PATCH',query:{id:`eq.${row.id}`,updated_at:`eq.${current.updated_at}`},body:{decision:'published',article_id:saved.id,proposed_section:saved.category_name,decision_reason:'每日3500字深度稿已发布并回读验收',processed_at:new Date().toISOString(),ai_payload:{...current.ai_payload,daily_depth_attempt:{date,attempts,status:outcome.status},daily_depth_article_id:saved.id}}});
    } catch(error) {
      Object.assign(outcome,{status:isBudgetDeferred(error)?'budget-deferred':'not-published',reason:String(error.message).slice(0,700)});
      const current=(await supabase('news_candidates',{query:{select:'ai_payload,updated_at',id:`eq.${row.id}`,limit:'1'}}))?.[0];
      if(current && !current.ai_payload?.manual_editor_lock)await supabase('news_candidates',{method:'PATCH',query:{id:`eq.${row.id}`,updated_at:`eq.${current.updated_at}`},body:{ai_payload:{...current.ai_payload,daily_depth_attempt:{date,attempts,...outcome}}}});
    }
    report.results.push(outcome);console.log(JSON.stringify({event:'daily-depth-result',...outcome}));
    if(outcome.status==='budget-deferred')break;
  }
  report.completed=(await dailyRows(date)).length;report.remaining=Math.max(0,10-report.completed);
  report.status=report.remaining?'shortfall':'target-met';
  console.log(JSON.stringify({event:'daily-depth-report',...report},null,2));
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n每日深度稿（纽约 ${date}）：${report.completed}/10，正文至少3500汉字；缺额${report.remaining}。\n\n`+report.results.map(r=>`- ${r.candidate_id}: ${r.status} ${r.reason || r.article_id || ''}`).join('\n')+'\n');
  await supabase('automation_notifications',{method:'POST',body:{control_key:'china_hot',severity:report.remaining?'warning':'success',title:`每日深度稿 ${report.completed}/10（纽约 ${date}）`,message:`已验收${report.completed}篇3500字以上深度稿，尚缺${report.remaining}篇。${report.remaining?'现有总控下一轮继续补选；未达标稿不计数。':'今日目标已完成。'}`,details:report}});
  return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)runDailyDepth().catch(e=>{console.error(e);process.exitCode=1;});
