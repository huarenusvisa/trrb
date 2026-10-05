const crypto = require('node:crypto');
const writingStandard = require('./news-writing-standard');

const EDITORIAL_POLICY_VERSION = 'unified-news-research-2000-3500-v2';
const ICE_TRANSLATION_VERSION = 'zh-title-body-v12-tiered-review';
const DEEP_MIN = 2000;
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
  const errors = officeTitleErrors(article);
  const count = countChinese(article.content);
  const min=DEEP_MIN;
  const max=DEEP_MAX;
  if (count < min || count > max) errors.push(`深度稿正文必须为${min}–${max}个中文字符（实际${count}）`);
  if (independentSourceCount(research) < 2) errors.push('深度稿至少需要两家独立来源的实际检索引文，评论及循环转载不计数');
  for (const field of DEEP_REVIEW_FIELDS) if (review?.[field] !== true) errors.push(`深度资料复核缺失：${field}`);
  return errors;
}

const OFFICE_TITLE_INSTRUCTIONS = '必须按事件发生日期核实人物现任职务，不能沿用模型记忆或旧报道称谓。特朗普自2025年1月20日起的第二任期报道应称美国总统特朗普，不得称前总统；2021至2024年历史事件必须明确日期和当时身份。第三国国内事件仅在原始事件有中国或美国实际参与或可核实直接影响时采编；外国最高法院、总统、议会、警察不等于美国机构，不能为了入选补写泛泛中美影响。';
function officeTitleErrors(article, now = Date.now()) {
  if (now < Date.parse('2025-01-20T17:00:00Z') || now >= Date.parse('2029-01-20T17:00:00Z')) return [];
  const fields = [article?.title, article?.summary, article?.content, article?.seo_title];
  const invalid = /(?<![此之以])前\s*(?:美国|美國)?\s*(?:总统|總統)\s*(?:唐纳德[·・\s]*|唐納德[·・\s]*)?(?:特朗普|川普)|former\s+(?:(?:US|U\.S\.)\s+)?president\s+(?:Donald\s+)?Trump|(?:特朗普|川普)\s*前(?:总统|總統)/i;
  for (const field of fields) for (const sentence of String(field || '').split(/[。！？!?\n]/)) {
    if (invalid.test(sentence) && !(/202[1-4]/.test(sentence) && /时任|時任|当时|當時|then[- ]/i.test(sentence))) return ['人物任职称谓错误：当前任期的特朗普不得称前总统；历史引用须写明事件日期和当时身份'];
  }
  return [];
}

function reviewedStoryReady(story) {
  if (officeTitleErrors(story).length) return false;
  if(countChinese(story.content)<800 || /\*|\\n/.test(story.content || '') || writingStandard.blockedSource([story.title,story.content].join(' ')))return false;
  const p = story?.ai_payload || {};
  const r = p.editorial_review;
  if (p.editorial_policy_version !== EDITORIAL_POLICY_VERSION || p.reviewed_content_sha256 !== contentDigest(story.title, story.content)) return false;
  if (!r || ['single_event','grounded','sufficient','analysis_grounded','court_status_correct','fresh_event','image_grounded'].some(k => r[k] !== true)) return false;
  if (!['brief','standard','deep'].includes(p.editorial_depth)) return false;
  const attributed = ['brief','standard'].includes(p.editorial_depth) && r.attributed_source === true && typeof r.attribution_evidence === 'string' && r.attribution_evidence.trim().length >= 10;
  if (r.source_chain_complete !== true && !attributed) return false;
  // Brief/standard suitability is checked by sufficient + exact tier bounds below.
  // The qualitative depth veto applies only to a claimed deep report.
  if (p.editorial_depth === 'deep' && r.depth_appropriate !== true) return false;
  const n = countChinese(story.content);
  if (p.editorial_depth === 'brief') return false;
  if (p.editorial_depth === 'standard' && (n < 800 || n > 1999)) return false;
  return deepQualityErrors({content:story.content,editorial_depth:p.editorial_depth}, p.context_research, r).length === 0;
}
const DEEP_RESEARCH_INSTRUCTIONS = OFFICE_TITLE_INSTRUCTIONS + '优质实时热点可写2000至3500个中文字符的深度稿，但必须具备可核验数据（日期、统计周期、样本/分母、口径及可比性），新闻上游（原始发布、文件、原始报道）、新闻下游（独立跟进、当事人回应），事件上游（时间线、政策/判例依据、已证实原因）、事件下游（已发生结果和下一程序节点；预判必须注明条件与不确定性）。考察与华人具体相关的法律适用范围、签证/身份、留学、工作、经商、税务、家庭或安全影响；没有依据就明确无法确认直接影响，不能因姓名或族裔猜测。法院材料必须区分起诉、临时禁令、裁决、判例效力、上诉、暂缓与生效范围。评论只能是明确归因的观点，不能当作事实、数据、独立来源或民意比例。任何维度资料不足时降为普通稿/短讯，不能凑字冒充深度稿。';

function manualEditorialMetadata(story,title,content) {
  try {writingStandard.assertEditedContent({title,content});} catch(error) {error.statusCode=400;throw error;}
  const p=story.ai_payload||{};
  const checked=reviewedStoryReady({title,content,ai_payload:p});
  const n=countChinese(content), depth=checked ? p.editorial_depth : n<800 ? 'brief' : 'standard';
  return {editorial_policy_version:EDITORIAL_POLICY_VERSION,editorial_depth:depth,article_format:depth==='deep'?'deep_analysis':depth==='brief'?'hot_brief':'report',body_character_count:n,editorial_review:checked?p.editorial_review:null,context_research:p.context_research||null,supporting_sources:p.context_research?.sources||[],manual_content_review:true};
}

function sourceWithinCollectionWindow(value,now=Date.now()) {
  const time=Date.parse(value || '');
  return Number.isFinite(time) && now-time>=0 && now-time<=12*3600000;
}
module.exports = {officeTitleErrors, OFFICE_TITLE_INSTRUCTIONS, EDITORIAL_POLICY_VERSION, ICE_TRANSLATION_VERSION, DEEP_MIN, DEEP_MAX, DEEP_REVIEW_FIELDS, countChinese, contentDigest, sourcePublisher, factualSources, independentSourceCount, deepQualityErrors, reviewedStoryReady, DEEP_RESEARCH_INSTRUCTIONS, manualEditorialMetadata,sourceWithinCollectionWindow};
