const crypto = require('node:crypto');
const INSTRUCTION = '发布者2026-10-02明确授权：证据不足也可以发布，有问题由人工后续处理。';
function evidencePendingArticle(draft, rawText, reason, time = new Date().toISOString()) {
  const raw=String(rawText || '').replace(/\\n/g,'\n').trim();
  if (raw.replace(/\s/g,'').length < 20 || !/^https:\/\//.test(draft?.source_url || '')) throw new Error('缺少具体来源材料');
  const title='来源消息：'+String(draft.title || '').replace(/^来源消息[：:]/,'');
  const name=draft.source_name || draft.source_account || '原始来源';
  const content='据'+name+'发布的消息，原文称：\n\n'+raw+'\n\n以上内容来自该来源，相关细节仍待进一步核实。';
  const summary='据'+name+'消息：'+raw.slice(0,160);
  const hash=crypto.createHash('sha256').update(title+'\n'+content).digest('hex');
  return {...draft,title,summary,content,seo_title:title,seo_description:summary,status:'published',visibility:'public',published_at:time,updated_at:time,cover_image:'',image_alt:'',review_status:'published_pending_manual_review',risk_flags:['unverified_public_claim'],
    metadata:{...draft.metadata,automatic_publish:true,manual_review_required:true,requires_editor_review:true,publication_blocked_until_edited:false,review_status:'published_pending_manual_review',post_publication_review_status:'pending',post_publication_review_reason:String(reason || '资料不足'),publication_mode:'publish_then_review',editorial_depth:'brief',daily_deep_commission:false,homepage_focus_override:'exclude',source_text_original:raw,reviewed_content_sha256:null,
      publisher_authorized_release:{version:'1',approved:true,content_sha256:hash,source_url:draft.source_url,approved_by:'publisher_standing_instruction_20261002',instruction:INSTRUCTION,approved_at:time}}};
}
function evidenceHoldEligible(reason) {
  const text=String(reason || '');
  return /不足|素材|资料|材料|来源链|独立来源|证据/.test(text) && !/旧闻|时效|总统|栏目不一致|无法分类|多主题|重复|虚构|配图|图片/.test(text);
}
module.exports={evidencePendingArticle,evidenceHoldEligible,INSTRUCTION};
