// Topic membership never changes the article's primary category or canonical URL.
export const POLITICS_TERMS = ['习近平','習近平','李强','李強','赵乐际','趙樂際','王沪宁','王滬寧','蔡奇','丁薛祥','李希','张又侠','張又俠','中共中央','中央政治局','政治局常委','中央军委','中央纪委','国家监委','中国国务院','国务院总理','全国人大','全国政协','省委书记','市委书记','中央组织部','中宣部','中共','人事任免'];
export const XI_TERMS = ['习近平','習近平'];
export const POLITICS_VIEWS = {
  leadership: {label:'领导人动态', terms:['习近平','習近平','李强','李強','赵乐际','趙樂際','王沪宁','王滬寧','蔡奇','丁薛祥','李希','张又侠','張又俠','总书记','常委','总理','主席']},
  appointments: {label:'人事任免', terms:['任命','免职','任免','履新','接任','撤职','辞职','卸任','提名','当选','被查','调查','双开','落马']},
  analysis: {label:'政治观察', terms:['分析','评论','观察','解读']}
};
export function termFilter(terms) { return `(${terms.flatMap(term => [`title.ilike.*${term}*`,`summary.ilike.*${term}*`]).join(',')})`; }
export const POLITICS_FILTER = termFilter(POLITICS_TERMS);
export const XI_FILTER = termFilter(XI_TERMS);
export const ICE_FILTER = '(topic_key.eq.ice,category_name.eq.ICE执法动态,category_name.eq.ICE执法,category_name.eq.驱逐快报)';
export const ENFORCEMENT_FILTER = '(topic_key.eq.ice,category_name.eq.ICE执法动态,category_name.eq.ICE执法,category_name.eq.驱逐快报,category_name.eq.美国警情)';
export function editorialTopics(row) {
  const text = `${row?.title || ''} ${row?.summary || row?.excerpt || ''}`;
  const topics = [];
  if (POLITICS_TERMS.some(term => text.includes(term))) topics.push('china-politics');
  if (XI_TERMS.some(term => text.includes(term))) topics.push('xi');
  return topics;
}
export function politicalSections(row) {
  const topics = editorialTopics(row);
  return ['中国热门头条', ...(topics.includes('china-politics') ? ['中国政治'] : []), ...(topics.includes('xi') ? ['习近平专题'] : [])];
}
