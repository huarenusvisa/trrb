import {createHash} from 'node:crypto';
import {sourceWithinCollectionWindow} from './news-editorial-policy.mjs';
const ACTION=/\b(?:announc\w*|issu\w*|rul(?:e[ds]?|ing)|signed|passed|charged|arrest\w*|seized|detain\w*|deport\w*|remov\w*|killed|rescued|filed|sentenc\w*|injunction|appeal\w*)\b|公布|发布|判决|裁定|起诉|逮捕|拘留|生效|实施|通过|签署|调查|撤销|任免|通报|抗议|死亡|枪击/i;
const IMPACT=/\b(?:policy|rule|court|visa|immigration|tariff|sanction|congress|rights|class.action|supreme)\b|政策|法院|判例|签证|留学|华人|华裔|中国公民|关税|制裁|权益|全国|集体诉讼/i;
const OPINION=/\b(?:opinion|commentary|throwback|anniversary|watch our show)\b|纯属猜测|网传|据传|回顾|周年|节目预告|点击观看/i;
export function newsPriority(row,now=Date.now()) {
  const date=row.source_created_at || row.created_at;
  if (!sourceWithinCollectionWindow(date,now)) return {score:-100,eligible:false,reasons:['outside_12h_window']};
  const text=String(row.source_text || row.text || '');
  const reasons=[];
  let score=10;
  if (ACTION.test(text)) {score+=25;reasons.push('concrete_development');}
  if (IMPACT.test(text)) {score+=20;reasons.push('public_or_reader_impact');}
  if (row.source_type==='official' && Number(row.trust_tier)===1) {score+=25;reasons.push('primary_official_source');}
  else if (row.source_level==='publisher_account' || ['major_media','local_media','specialist_media'].includes(row.source_type)) {score+=15;reasons.push('identified_publisher');}
  if (/(?:https:\/\/[^\s/]+\.(?:gov|uscourts\.gov)\/)|(?:document|docket|judgment|统计|文书|案号|全文)/i.test(text+' '+(row.source_links || []).join(' '))) {score+=10;reasons.push('document_or_data_lead');}
  if (now-Date.parse(date)<3*3600000) score+=5;
  if (OPINION.test(text)) {score-=20;reasons.push('unverified_or_commentary');}
  if (row.requires_editor_review || row.source_type==='monitored_individual') {score-=10;reasons.push('manual_verification_required');}
  // No badge, follower count, outrage or engagement score can make a source factual.
  return {score,eligible:ACTION.test(text),reasons};
}
export function compareNewsPriority(a,b) {return newsPriority(b).score-newsPriority(a).score || Date.parse(b.source_created_at || b.created_at)-Date.parse(a.source_created_at || a.created_at);}
export function sourceFingerprint(posts) {return createHash('sha256').update(JSON.stringify(posts.map(p=>[p.x_post_id,p.source_created_at,p.source_text]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))).digest('hex');}
export function editorialRetryAllowed(story,posts,now=Date.now()) {
  const old=story.ai_payload?.editorial_attempt;
  return !old || old.fingerprint!==sourceFingerprint(posts) || (old.count<2 && now-Date.parse(old.at)>=3600000);
}
