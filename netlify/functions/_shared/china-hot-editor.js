const {randomUUID}=require('node:crypto');
const {countChinese,contentDigest}=require('./news-editorial-policy');
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
const text=(v,max=30000)=>String(v||'').replace(/\u0000/g,'').trim().slice(0,max);
function evidenceUrls(value){return [...new Set((Array.isArray(value)?value:String(value||'').split(/\s+/)).filter(x=>{try{const u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}))].slice(0,12);}
async function handleChinaEdit(input,actor,{rest,now=()=>new Date().toISOString()}) {
  const id=text(input.id,100);if(!/^\d+$/.test(id))fail('内容池编号无效');
  const candidate=(await rest('news_candidates',{query:{select:'*',id:`eq.${id}`,pipeline:'like.china-hot-li-teacher%',limit:'1'}}))?.[0];
  if(!candidate)fail('稿件不存在',404);
  if(['deleted','duplicate','published'].includes(candidate.decision))fail('稿件已删除、重复或发布，请刷新列表',409);
  let article=candidate.article_id?(await rest('articles',{query:{select:'*',id:`eq.${candidate.article_id}`,limit:'1'}}))?.[0]:null;
  if(input.action==='detail')return {candidate,article};
  if(!['save','publish'].includes(input.action))fail('不支持的编辑操作');
  if(input.updated_at!==candidate.updated_at)fail('稿件已被其他操作修改，请重新打开',409);
  const title=text(input.title,300),content=text(input.content),summary=text(input.summary,2000),cover=text(input.cover_image,2000);
  if(!title||!content)fail('请填写标题和正文');
  if(/<\/?[a-z][^>]*>/i.test(title+' '+content))fail('请使用纯文本正文');
  if(cover&&!/^https:\/\/[^\s]+$/.test(cover))fail('图片必须是HTTPS地址');
  const publishing=input.action==='publish',sources=evidenceUrls(input.evidence_urls),note=text(input.verification_note,4000);
  if(publishing){
    if(input.facts_confirmed!==true||input.freshness_confirmed!==true)fail('请核对事实来源及事件的新进展后勾选确认');
    if(!sources.length||note.length<10)fail('请填写核实依据链接和具体核实说明');
    if(/自动加工未完成|未经编辑不得发布|请核对原始材料并重新加工|【编辑提示】|此稿未通过自动加工质量检查/.test(content)||countChinese(content)<50)fail('请完成新闻正文，不能发布占位草稿或标题');
    const sameSource=candidate.source_url?(await rest('articles',{query:{select:'id,title',status:'eq.published',source_url:`eq.${candidate.source_url}`,limit:'5'}}))||[]:[];
    const sameTitle=(await rest('articles',{query:{select:'id,title',status:'eq.published',title:`eq.${title}`,limit:'5'}}))||[];
    if([...sameSource,...sameTitle].some(x=>x.id!==article?.id))fail('同源或同标题文章已经发布，请核对重复后删除候选',409);
  }
  const time=now();
  const locked=(await rest('news_candidates',{method:'PATCH',query:{id:`eq.${id}`,updated_at:`eq.${candidate.updated_at}`,decision:'not.in.(deleted,duplicate,published)'},body:{ai_payload:{...candidate.ai_payload,manual_editor_lock:true,manual_editor:actor.id,manual_review_required:true,editable:true},updated_at:time},prefer:'return=representation'}))?.[0];
  if(!locked)fail('稿件已发生变化，请刷新后重试',409);
  const n=countChinese(content),metadata={...article?.metadata,manual_editor_lock:true,manual_editor:actor.id,manual_review_required:!publishing,publication_blocked_until_edited:!publishing,automatic_publish:false,manual_content_review:publishing,manual_verified_by:publishing?actor.id:null,manual_verified_at:publishing?time:null,manual_verification_note:note,manual_evidence_urls:sources,manual_facts_confirmed:publishing,manual_freshness_confirmed:publishing,editorial_depth:n<800?'brief':'standard',article_format:n<800?'hot_brief':'report',body_character_count:n,editorial_review:null,reviewed_content_sha256:contentDigest(title,content),publication_scope:n<800?'topic_only':'standard',homepage_focus_override:!cover||n<800?'exclude':'auto',text_only_verified:publishing&&!cover};
  const body={title,summary,content,cover_image:cover,status:publishing?'published':'draft',visibility:publishing?'public':'private',published_at:publishing?(article?.published_at||time):null,updated_at:time,review_status:publishing?'human_verified_china_hot':'manual_review',metadata};
  let saved;
  if(article){
    saved=(await rest('articles',{method:'PATCH',query:{id:`eq.${article.id}`,updated_at:`eq.${article.updated_at}`,status:'neq.published'},body,prefer:'return=representation'}))?.[0];
    if(!saved)fail('文章已被修改或发布，请重新打开',409);
  }else{
    const articleId=randomUUID();
    saved=(await rest('articles',{method:'POST',body:{...body,id:articleId,slug:`china-editor-${articleId}`,category_name:candidate.proposed_section||'中国热门头条',author:'唐人日报编辑部',automation_source:'china-hot-li-teacher-v2',source_url:candidate.source_url,source_account:candidate.source_account,source_created_at:candidate.raw_payload?.source_created_at||candidate.collected_at,source_post_id:candidate.raw_payload?.tweet_id||null,created_at:time},prefer:'return=representation'}))?.[0];
  }
  if (!saved?.id) fail('文章保存失败，请重新打开核对',409);
  const linked=await rest('news_candidates',{method:'PATCH',query:{id:`eq.${id}`,updated_at:`eq.${locked.updated_at}`,decision:'not.in.(deleted,duplicate,published)'},body:{article_id:saved.id,decision:publishing?'published':'review_required',decision_reason:publishing?'编辑核实来源后发布':'编辑已保存草稿，等待核实发布',ai_payload:{...locked.ai_payload,title,summary,content,manual_review_required:!publishing},processed_at:time,updated_at:now()},prefer:'return=representation'});
  if (!linked?.length) fail('文章已保存，但内容池状态被其他操作修改，请刷新核对，勿重复发布',409);
  return {ok:true,article:saved};
}
module.exports={handleChinaEdit,evidenceUrls};
