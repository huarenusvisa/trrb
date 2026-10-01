import {factualSources} from './news-editorial-policy.mjs';
// A report can accurately describe an allegation without independently confirming it.
export const ATTRIBUTED_REPORT_INSTRUCTIONS = '\n编辑发布政策（2026-10-01）：来源优先级：已经取得并核验的原始媒体报道或官方文件优先于转载账号。若CNBC等原媒体支持核心事实，导语直接归因该媒体，不再叠加李老师等转述账号。只在确实取得原媒体材料时使用原媒体归因；仅看到转载不能冒称直接核验。审核必须填写primary_source_url、primary_source_name、primary_source_supports_core；URL只能选实际检索sources中支持当前核心事件的原始报道/文件，不能选背景资料、聚合站或另一起事件，无法确认则URL和名称留空、supports_core=false。标题禁止使用“网帖称：”“網帖稱：”等机械前缀。标题直接概括事件；指控、传闻和未确认事实仍须使用“涉嫌”“被指”“传闻”等准确措辞，具体来源归因放在导语，不得把未核实说法写成已确认事实。有新闻价值的单一来源爆料可以作为普通稿或短讯发表，尤其是刚发生的中国新闻。不得仅因没有第二来源、官方回应、后续进展或外部检索结果而拒绝。必须读取原帖正文及图片中真实可见的材料；明确写出哪个账号、媒体或当事人提出什么说法。未经独立核实的指控应在标题或导语准确归因，正文不得把指控改为已证实事实；可以简短说明目前仅有该来源，不要反复堆免责声明。不得凭空增加专家、调查、学校动机、诊断、伤亡或日期，不得把评论数量当民意。只有标题且没有可报道细节、广告营销、垃圾拼接及无新闻价值的内容仍不成稿。来源有限时缩短正文，不凑字。审核的attributed_source仅在原帖/报道可定位、核心说法和图片内容可回溯到输入材料、标题导语及正文归因准确、明确区分指控与事实时为true；attribution_evidence必须具体写明来源名称和正文中的归因依据。source_chain_complete与independent_sources可以如实为false，不能据此否决已通过attributed_source的普通稿/短讯。grounded、single_event、sufficient、analysis_grounded仍须真实通过。深度资料不足改为普通稿或短讯，不能伪造独立来源。';

export function sourceReviewPassed(article) {
  const r=article?.editorial_review;
  return r?.source_chain_complete === true || (
    ['brief','standard'].includes(article?.editorial_depth) &&
    r?.attributed_source === true &&
    typeof r.attribution_evidence === 'string' && r.attribution_evidence.trim().length >= 10
  );
}

export function publicationReviewFields(article) {
  const sourceField=sourceReviewPassed(article) && article.editorial_review?.source_chain_complete !== true ? 'attributed_source' : 'source_chain_complete';
  return ['single_event','grounded','sufficient',sourceField,'analysis_grounded','court_status_correct',...(article.editorial_depth==='deep'?['fresh_hot_event','depth_appropriate']:[])];
}

export function primarySourceReviewSchema(research) {
 return {primary_source_url:{type:'string',enum:['',...new Set(factualSources(research).map(s=>s.url))]},primary_source_name:{type:'string'},primary_source_supports_core:{type:'boolean'}};
}
export function preferredPublicationSource(article,research) {
 const r=article.editorial_review || {};
 if(r.primary_source_supports_core!==true || !r.primary_source_name?.trim())return null;
 const source=factualSources(research).find(s=>s.url===r.primary_source_url);
 if(!source)return null;
 const host=new URL(source.url).hostname.toLowerCase();
 if(/(^|\.)(x\.com|twitter\.com|facebook\.com|t\.co)$/.test(host))return null;
 return {name:host==='cnbc.com'||host.endsWith('.cnbc.com')?'CNBC':r.primary_source_name.trim().slice(0,80),url:source.url};
}
export function makeAttributionExplicit(article, sourceName, research) {
  const originalTitle=String(article.title || '');
  article.title=originalTitle.replace(/^(?:(?:网帖称|網帖稱)\s*[：:]\s*)+/u,'');
  let changed=article.title!==originalTitle;
  const primary=preferredPublicationSource(article,research);
  if(primary){
    const original=String(article.content || '');
    // Remove only the mechanical collection-account wrapper, not quoted witness evidence.
    const wrapper=`据X账号“${String(sourceName || '原发布者').slice(0,80)}”发布的消息，`;
    let content=original.startsWith(wrapper)?original.slice(wrapper.length):original;
    if(!content.slice(0,180).includes(primary.name))content=`据${primary.name}报道，${content}`;
    article.content=content;
    return changed || content!==original;
  }
  if (!['brief','standard'].includes(article.editorial_depth) || article.editorial_review?.attributed_source !== true || article.editorial_review?.source_chain_complete === true) return changed;
  const name=String(sourceName || '原发布者').slice(0,80);
  if (!String(article.content).slice(0,180).includes(name)) {
    article.content=`据X账号“${name}”发布的消息，${article.content}`; changed=true;
  }
  return changed;
}
