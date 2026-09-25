const crypto = require('node:crypto');

const EDITORIAL_POLICY_VERSION = 'unified-news-research-2500-3500-v1';
const ICE_TRANSLATION_VERSION = 'zh-title-body-v11-unified-research';
const DEEP_MIN = 2500;
const DEEP_MAX = 3500;
const DEEP_REVIEW_FIELDS = ['independent_sources', 'data_verified', 'data_context', 'news_upstream', 'news_downstream', 'event_upstream', 'event_downstream', 'reader_impact_examined'];
function countChinese(value) {
  return (String(value || '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, '').replace(/https?:\/\/\S+/g, '').match(/[\u3400-\u9fff]/gu) || []).length;
}
function contentDigest(title, content) { return crypto.createHash('sha256').update(`${title || ''}\n${content || ''}`).digest('hex'); }
function sourcePublisher(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (/^(?:.*\.)?(?:x\.com|twitter\.com|t\.co|facebook\.com|reddit\.com|youtube\.com)$/.test(host)) return null;
    // Shared publishers / subdomains do not create independent sources.
    if (/(^|\.)reuters\.com$/.test(host)) return 'reuters.com';
    if (/(^|\.)bbc\.(?:com|co\.uk)$/.test(host)) return 'bbc';
    if (/(^|\.)(?:ice|dhs|cbp|uscis)\.gov$/.test(host)) return 'dhs.gov';
    const parts = host.split('.');
    return /\.(?:com|co|org)\.[a-z]{2}$/.test(host) ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
  } catch { return null; }
}
function factualSources(research) {
  if (research?.web_search_completed !== true) return [];
  return (research.sources || []).filter(s => s.tool_cited === true && s.kind === 'web_evidence' && /^https?:\/\//.test(s.url || '') && sourcePublisher(s.url));
}
function independentSourceCount(research) { return new Set(factualSources(research).map(s => sourcePublisher(s.url))).size; }
function deepQualityErrors(article, research, review = article.editorial_review) {
  if (article.editorial_depth !== 'deep') return [];
  const errors = [];
  const count = countChinese(article.content);
  if (count < DEEP_MIN || count > DEEP_MAX) errors.push(`深度稿正文必须为${DEEP_MIN}–${DEEP_MAX}个中文字符（实际${count}）`);
  if (independentSourceCount(research) < 2) errors.push('深度稿至少需要两家独立来源的实际检索引文，评论及循环转载不计数');
  for (const field of DEEP_REVIEW_FIELDS) if (review?.[field] !== true) errors.push(`深度资料复核缺失：${field}`);
  return errors;
}
function reviewedStoryReady(story) {
  const p = story?.ai_payload || {};
  const r = p.editorial_review;
  if (p.editorial_policy_version !== EDITORIAL_POLICY_VERSION || p.reviewed_content_sha256 !== contentDigest(story.title, story.content)) return false;
  if (!r || ['single_event','grounded','sufficient','source_chain_complete','analysis_grounded','depth_appropriate','court_status_correct','fresh_event','image_grounded'].some(k => r[k] !== true)) return false;
  if (!['brief','standard','deep'].includes(p.editorial_depth)) return false;
  const n = countChinese(story.content);
  if (p.editorial_depth === 'brief' && (n < 1 || n > 799)) return false;
  if (p.editorial_depth === 'standard' && (n < 800 || n > 2499)) return false;
  return deepQualityErrors({content:story.content,editorial_depth:p.editorial_depth}, p.context_research, r).length === 0;
}
const DEEP_RESEARCH_INSTRUCTIONS = '优质实时热点可写2500至3500个中文字符的深度稿，但必须具备可核验数据（日期、统计周期、样本/分母、口径及可比性），新闻上游（原始发布、文件、原始报道）、新闻下游（独立跟进、当事人回应），事件上游（时间线、政策/判例依据、已证实原因）、事件下游（已发生结果和下一程序节点；预判必须注明条件与不确定性）。考察与华人具体相关的法律适用范围、签证/身份、留学、工作、经商、税务、家庭或安全影响；没有依据就明确无法确认直接影响，不能因姓名或族裔猜测。法院材料必须区分起诉、临时禁令、裁决、判例效力、上诉、暂缓与生效范围。评论只能是明确归因的观点，不能当作事实、数据、独立来源或民意比例。任何维度资料不足时降为普通稿/短讯，不能凑字冒充深度稿。';

function manualEditorialMetadata(story,title,content) {
  const p=story.ai_payload||{};
  const checked=reviewedStoryReady({title,content,ai_payload:p});
  const n=countChinese(content), depth=checked ? p.editorial_depth : n<800 ? 'brief' : 'standard';
  return {editorial_policy_version:EDITORIAL_POLICY_VERSION,editorial_depth:depth,article_format:depth==='deep'?'deep_analysis':depth==='brief'?'hot_brief':'report',body_character_count:n,editorial_review:checked?p.editorial_review:null,context_research:p.context_research||null,supporting_sources:p.context_research?.sources||[],manual_content_review:true};
}

module.exports = {EDITORIAL_POLICY_VERSION, ICE_TRANSLATION_VERSION, DEEP_MIN, DEEP_MAX, DEEP_REVIEW_FIELDS, countChinese, contentDigest, sourcePublisher, factualSources, independentSourceCount, deepQualityErrors, reviewedStoryReady, DEEP_RESEARCH_INSTRUCTIONS, manualEditorialMetadata};
