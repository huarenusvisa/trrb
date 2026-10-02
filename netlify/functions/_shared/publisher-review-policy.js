const writingStandard = require('./news-writing-standard.js');
const crypto = require('node:crypto');
const INSTRUCTION = '发布者2026-10-02明确授权：证据不足也可以发布，有问题由人工后续处理。';
function evidencePendingArticle(draft, rawText, reason, time = new Date().toISOString(), edited) {
  const raw=String(rawText || '').replace(/\\n/g,'\n').trim();
  if (raw.replace(/\s/g,'').length < 20 || !/^https:\/\//.test(draft?.source_url || '')) throw new Error('缺少具体来源材料');
  if (!edited || edited.appears_old_news || edited.editorial_review?.single_event!==true || edited.editorial_review?.grounded!==true || edited.editorial_review?.analysis_grounded!==true || edited.editorial_review?.court_status_correct!==true) throw new Error('资料待核实不等于可以发布未经采写或无事实依据的线索');
  const usPolitics=draft.category_name==='美国时政' || draft.primary_section==='美国时政';
  const n=writingStandard.assertEditedContent({...edited,source_name:draft.source_name,source_account:draft.source_account},{usPolitics});
  const title=String(edited.title).trim().replace(/^来源消息[：:]/,'');
  const content=String(edited.content).trim();
  const summary=String(edited.summary || '').trim();
  const hash=crypto.createHash('sha256').update(title+'\n'+content).digest('hex');
  return {...draft,title,summary,content,seo_title:title,seo_description:summary,status:'published',visibility:'public',published_at:time,updated_at:time,cover_image:'',image_alt:'',review_status:'published_pending_manual_review',risk_flags:['unverified_public_claim'],
    metadata:{...draft.metadata,automatic_publish:true,manual_review_required:true,requires_editor_review:true,publication_blocked_until_edited:false,review_status:'published_pending_manual_review',post_publication_review_status:'pending',post_publication_review_reason:String(reason || '资料不足'),publication_mode:'publish_then_review',editorial_depth:n>=2000?'standard':n>=800?'standard':'brief',body_character_count:n,editorial_standard_version:writingStandard.VERSION,daily_deep_commission:false,homepage_focus_override:'exclude',source_text_original:raw,reviewed_content_sha256:null,editorial_review:edited.editorial_review,
      publisher_authorized_release:{version:'1',approved:true,content_sha256:hash,source_url:draft.source_url,approved_by:'publisher_standing_instruction_20261002',instruction:INSTRUCTION,approved_at:time}}};
}
function evidenceHoldEligible(reason) {
  const text=String(reason || '');
  return /不足|素材|资料|材料|来源链|独立来源|证据/.test(text) && !/旧闻|时效|总统|栏目不一致|无法分类|多主题|重复|虚构|配图|图片/.test(text);
}
module.exports={evidencePendingArticle,evidenceHoldEligible,INSTRUCTION};
