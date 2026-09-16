// Topic membership never changes the article's primary category or canonical URL.
export const POLITICS_TERMS = ['习近平','習近平','李强','李強','赵乐际','趙樂際','王沪宁','王滬寧','蔡奇','丁薛祥','李希','张又侠','張又俠','薄熙来','薄熙來','王岐山','胡春华','胡春華','中央政治局','政治局常委','中央军委','中央軍委','中央纪委','中央紀委','国家监委','國家監委','中共中央','国务院','國務院','全国人大','全國人大','全国政协','全國政協','省委书记','省委書記','市委书记','市委書記','党委书记','黨委書記','官员','官員','省长','省長','市长','市長','部长','部長','军委','軍委','军队','軍隊','解放军','解放軍','上将','上將','中将','中將','统战部','統戰部','组织部','組織部','政法委','中共'];
export const POLITICAL_EVENTS = ['任命','任免','免职','免職','调任','調任','调离','調離','履新','接任','撤职','撤職','卸任','提名','当选','當選','被查','调查','調查','审查','審查','双开','雙開','落马','落馬','开除','開除','受贿','受賄','判刑','宣判','政变','政變','兵变','兵變','夺权','奪權','权力','權力','失势','失勢','清洗','整肃','整肅','派系','政坛','政壇','内斗','內鬥','政治斗争','政治鬥爭','传闻','傳聞','传言','傳言','辟谣','闢謠','否认','否認','拘押','软禁','軟禁','去世','逝世','病危','健康','死亡','会见','會見','访问','訪問','访美','訪美','出席','讲话','講話','会议','會議','全会','全會','缺席','露面','公开活动','公開活動','改革','机构','機構'];
const POLITICAL_NOISE = ['招募','欢迎活动','歡迎活動','欢迎队伍','歡迎隊伍','接机','接機','观光','觀光','抽奖','抽獎','购物','購物','美食','演唱会','演唱會','餐馆','餐館','餐厅','餐廳','超市','欠薪','校园','校園','毕业生补贴','畢業生補貼'];
export function isChinaPolitical(row) {
  const title = String(row?.title || '');
  const text = `${title} ${row?.summary || row?.excerpt || ''}`;
  if (POLITICAL_NOISE.some(term => title.includes(term))) return false;
  const foreign = /美国|美國|英国|英國|日本|韩国|韓國|印度|台湾|台灣|臺灣|加拿大|澳大利亚|澳大利亞|法国|法國|德国|德國|以色列/;
  const chinaCore = /中国|中國|中共|习近平|習近平|李强|李強|薄熙来|薄熙來|王岐山|张又侠|張又俠|中央军委|中央軍委/;
  if (foreign.test(title) && !chinaCore.test(title)) return false;
  return POLITICS_TERMS.some(term => text.includes(term)) && POLITICAL_EVENTS.some(term => text.includes(term));
}
export const XI_TERMS = ['习近平','習近平'];
export const POLITICS_VIEWS = {
  leadership: {label:'领导人动态', terms:['习近平','習近平','李强','李強','赵乐际','趙樂際','王沪宁','王滬寧','蔡奇','丁薛祥','李希','张又侠','張又俠','总书记','常委','总理','主席']},
  appointments: {label:'人事任免', terms:['任命','免职','任免','履新','接任','撤职','辞职','卸任','提名','当选','被查','调查','双开','落马']},
  analysis: {label:'政治观察', terms:['分析','评论','观察','解读']}
};
export function termFilter(terms) { return `(${terms.flatMap(term => [`title.ilike.*${term}*`,`summary.ilike.*${term}*`]).join(',')})`; }
export const POLITICS_FILTER = `(and(or(${POLITICS_TERMS.map(term => `title.ilike.*${term}*`).join(',')}),or(${POLITICAL_EVENTS.map(term => `title.ilike.*${term}*`).join(',')}),${POLITICAL_NOISE.map(term => `title.not.ilike.*${term}*`).join(',')}))`;
export const XI_FILTER = termFilter(XI_TERMS);
export const ICE_FILTER = '(topic_key.eq.ice,category_name.eq.ICE执法动态,category_name.eq.ICE执法,category_name.eq.驱逐快报)';
export const ENFORCEMENT_FILTER = '(topic_key.eq.ice,category_name.eq.ICE执法动态,category_name.eq.ICE执法,category_name.eq.驱逐快报,category_name.eq.美国警情)';
export function editorialTopics(row) {
  const text = `${row?.title || ''} ${row?.summary || row?.excerpt || ''}`;
  const topics = [];
  if (isChinaPolitical(row)) topics.push('china-politics');
  if (XI_TERMS.some(term => text.includes(term))) topics.push('xi');
  return topics;
}
export function politicalSections(row) {
  const topics = editorialTopics(row);
  return ['中国热门头条', ...(topics.includes('china-politics') ? ['中国政治'] : []), ...(topics.includes('xi') ? ['习近平专题'] : [])];
}

// Midterm hub is a collection; source categories and article URLs stay intact.
export const ELECTION_TERMS = ['中期选举','中期選舉','初选','选战','参院战','选情','控制权争夺','关键战场','选区重划','邮寄选票','选民登记'];
export const ELECTION_FILTER = `(topic_key.eq.election,and(or(category_name.eq.美国时政,topic_key.eq.trump,topic_key.eq.ice),or${termFilter(ELECTION_TERMS)}))`;
