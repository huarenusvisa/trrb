// A report can accurately describe an allegation without independently confirming it.
export const ATTRIBUTED_REPORT_INSTRUCTIONS = '\n编辑发布政策（2026-09-30）：有新闻价值的单一来源爆料可以作为普通稿或短讯发表，尤其是刚发生的中国新闻。不得仅因没有第二来源、官方回应、后续进展或外部检索结果而拒绝。必须读取原帖正文及图片中真实可见的材料；明确写出哪个账号、媒体或当事人提出什么说法。未经独立核实的指控应在标题或导语准确归因，正文不得把指控改为已证实事实；可以简短说明目前仅有该来源，不要反复堆免责声明。不得凭空增加专家、调查、学校动机、诊断、伤亡或日期，不得把评论数量当民意。只有标题且没有可报道细节、广告营销、垃圾拼接及无新闻价值的内容仍不成稿。来源有限时缩短正文，不凑字。审核的attributed_source仅在原帖/报道可定位、核心说法和图片内容可回溯到输入材料、标题导语及正文归因准确、明确区分指控与事实时为true；attribution_evidence必须具体写明来源名称和正文中的归因依据。source_chain_complete与independent_sources可以如实为false，不能据此否决已通过attributed_source的普通稿/短讯。grounded、single_event、sufficient、analysis_grounded仍须真实通过。深度资料不足改为普通稿或短讯，不能伪造独立来源。';

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
