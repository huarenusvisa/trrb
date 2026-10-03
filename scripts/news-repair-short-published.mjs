import './news-budget-preload.mjs';
import {depthCandidates,nyDate} from './news-daily-depth.mjs';
import {supabase,tweetFromCandidate,qualifyTweet,generateArticle,buildPublishedArticle,existingArticle,bodyCharacterCount} from './china-hot-li-teacher-ingest.mjs';
import {automationMayUpdate,articleUpdateBody,verifyArticleUpdate} from './news-article-updates.mjs';
import {isBudgetDeferred} from './news-cost-model.mjs';

const date=nyDate(),results=[],seen=new Set(),deadline=Date.now()+25*60000;
for(const candidate of await depthCandidates(date)) {
  if(Date.now()>deadline)break;
  const tweet=tweetFromCandidate(candidate);
  const prior=candidate.article_id ? (await supabase('articles',{query:{select:'*',id:`eq.${candidate.article_id}`,limit:'1'}}))?.[0] : await existingArticle(tweet);
  if(!prior || seen.has(prior.id) || !prior.published_at || nyDate(prior.published_at)!==date || bodyCharacterCount(prior.content)>=800 || !automationMayUpdate(prior))continue;
  seen.add(prior.id);
  try {
    const qualified=qualifyTweet(tweet);
    if(!qualified.accepted)throw new Error(qualified.reason);
    const article=await generateArticle(qualified,tweet,0,null,'standard');
    if(article.appears_old_news)throw new Error('来源未核实近期进展');
    const next=buildPublishedArticle(tweet,qualified,article);
    const reason=await verifyArticleUpdate(prior,next,{request:async(url,options)=>{
      const response=await fetch(url,{...options,signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw new Error(`更新复核 HTTP ${response.status}`);
      return response.json();
    }});
    if(!reason)throw new Error('补采重写未通过同一事件更新复核');
    const saved=await supabase('articles',{method:'PATCH',query:{id:`eq.${prior.id}`,updated_at:`eq.${prior.updated_at}`,status:'eq.published',visibility:'eq.public'},body:articleUpdateBody(prior,next,reason),prefer:'return=representation'});
    if(saved?.length!==1 || bodyCharacterCount(saved[0].content)<800)throw new Error('文章已被编辑修改或回读验收失败');
    results.push({id:prior.id,status:'repaired',chinese_chars:bodyCharacterCount(saved[0].content)});
  }catch(error){results.push({id:prior.id,status:'not-repaired',reason:String(error.message).slice(0,700)});if(isBudgetDeferred(error))break;}
  console.log(JSON.stringify({event:'short-news-repair',...results.at(-1)}));
}
console.log(JSON.stringify({event:'short-news-repair-report',date,results}));
if(results.some(r=>r.status!=='repaired'))console.error('::warning title=短稿修复仍有缺口::请查看逐稿补采或更新复核失败原因');
