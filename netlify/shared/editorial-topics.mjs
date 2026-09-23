import {chinaPersonNames,findChinaPeople} from './china-person-registry.mjs';
// Topic membership never changes the article's primary category or canonical URL.
export const POLITICS_TERMS = ['习近平','習近平','李强','李強','赵乐际','趙樂際','王沪宁','王滬寧','蔡奇','丁薛祥','李希','张又侠','張又俠','薄熙来','薄熙來','王岐山','胡春华','胡春華','中央政治局','政治局常委','中央军委','中央軍委','中央纪委','中央紀委','国家监委','國家監委','中共中央','国务院','國務院','全国人大','全國人大','全国政协','全國政協','省委书记','省委書記','市委书记','市委書記','党委书记','黨委書記','官员','官員','省长','省長','市长','市長','部长','部長','军委','軍委','军队','軍隊','解放军','解放軍','上将','上將','中将','中將','统战部','統戰部','组织部','組織部','政法委','中共'];
export const POLITICAL_EVENTS = ['任命','任免','免职','免職','调任','調任','调离','調離','履新','接任','撤职','撤職','卸任','提名','当选','當選','被查','调查','調查','审查','審查','双开','雙開','落马','落馬','开除','開除','受贿','受賄','判刑','宣判','政变','政變','兵变','兵變','夺权','奪權','权力','權力','失势','失勢','清洗','整肃','整肅','派系','政坛','政壇','内斗','內鬥','政治斗争','政治鬥爭','传闻','傳聞','传言','傳言','辟谣','闢謠','否认','否認','拘押','软禁','軟禁','去世','逝世','病危','健康','死亡','会见','會見','访问','訪問','访美','訪美','出席','讲话','講話','会议','會議','全会','全會','缺席','露面','公开活动','公開活動','改革','机构','機構','批评','批評','表态','表態','指控','公开信','公開信','声明','聲明','共识','共識'];
const POLITICAL_NOISE = ['招募','欢迎活动','歡迎活動','欢迎队伍','歡迎隊伍','接机','接機','观光','觀光','抽奖','抽獎','购物','購物','美食','演唱会','演唱會','餐馆','餐館','餐厅','餐廳','超市','欠薪','校园','校園','毕业生补贴','畢業生補貼'];
// Watch names are subjects, not an assertion about their current office or faction.
export const CHINA_LEADERS = chinaPersonNames();
const SENIOR_ROLES = /中央政治局|政治局常委|中央书记处|中央書記處|中央军委|中央軍委|中央办公厅|中央辦公廳|中共中央|省委书记|省委書記|(?<!副)省长|(?<!副)省長|自治区党委书记|自治區黨委書記|自治区主席|自治區主席|(?:北京|上海|天津|重庆|重慶)(?:市委书记|市委書記|市长|市長)|省部级正职|省部級正職|正部级|正部級/;
const MINISTRY_HEAD = /(?:外交部|国防部|國防部|教育部|财政部|財政部|公安部|国家安全部|國家安全部|司法部|商务部|商務部|应急管理部|應急管理部|交通运输部|交通運輸部|农业农村部|農業農村部|民政部|工业和信息化部|工業和信息化部|自然资源部|自然資源部|生态环境部|生態環境部|住房和城乡建设部|住房和城鄉建設部|人力资源和社会保障部|人力資源和社會保障部|水利部|文化和旅游部|文化和旅遊部|退役军人事务部|退役軍人事務部|科学技术部|科學技術部)[^。；\n]{0,16}(?<!副)(?:部长|部長)|(?:国家发展改革委|國家發展改革委|国家卫健委|國家衛健委|国家民族事务委员会|國家民族事務委員會)(?:原|前|现任|現任)?主任|中国人民银行行长|中國人民銀行行長/;
export function hasChinaSeniorSubject(text) {
 return findChinaPeople(text).length > 0 || SENIOR_ROLES.test(text) || MINISTRY_HEAD.test(text) || /(?:中国|中國)(?:原|前任|现任|現任)?(?:国防|國防|外交|公安|财政|財政)?(?:部长|部長)/.test(text);
}
export function isChinaPolitical(row) {
  const title = String(row?.title || '');
  const summary = String(row?.summary || row?.excerpt || '');
  const text = `${title} ${summary}`;
  if (POLITICAL_NOISE.some(term => title.includes(term))) return false;
  if (/校区|校區|学校|學校|学院|學院|中学|中學|小学|小學|教材|电子念珠|電子念珠|行业协会|行業協會|企业培训|企業培訓/.test(title) && !/任免|任命|免职|免職|撤职|撤職|被查|落马|落馬|受贿|受賄|开除|開除|判刑|宣判|政变|政變/.test(title)) return false;
  // Foreign actors mentioning a generic minister must never establish China membership.
  const foreign = /美国|美國|英国|英國|日本|韩国|韓國|印度|台湾|台灣|臺灣|加拿大|澳大利亚|澳大利亞|法国|法國|德国|德國|以色列|特朗普|川普|拜登|奥巴马|歐巴馬|五角大楼|五角大樓|\bICE\b|\bDHS\b|\bCBP\b|\bFBI\b/i;
  if (foreign.test(text) && !findChinaPeople(title).length && !SENIOR_ROLES.test(title) && !/中国|中國|中共/.test(title)) return false;
  if (!hasChinaSeniorSubject(text)) return false;
  return POLITICAL_EVENTS.some(term => text.includes(term));
}
export const XI_TERMS = ['习近平','習近平'];
export const POLITICS_VIEWS = {
  leadership: {label:'领导人动态', terms:['习近平','習近平','李强','李強','赵乐际','趙樂際','王沪宁','王滬寧','蔡奇','丁薛祥','李希','张又侠','張又俠','总书记','常委','总理','主席']},
  appointments: {label:'人事任免', terms:['任命','免职','任免','履新','接任','撤职','辞职','卸任','提名','当选','被查','调查','双开','落马']},
  analysis: {label:'政治观察', terms:['分析','评论','观察','解读']}
};
export function termFilter(terms) { return `(${terms.flatMap(term => [`title.ilike.*${term}*`,`summary.ilike.*${term}*`]).join(',')})`; }
export const POLITICS_FILTER = `(metadata->>china_politics_eligible.eq.true,and(or(${[...new Set([...POLITICS_TERMS,'中央办公厅','中央辦公廳','正部级','正部級'])].map(term => `title.ilike.*${term}*`).join(',')}),${POLITICAL_NOISE.map(term => `title.not.ilike.*${term}*`).join(',')}))`;
export const XI_FILTER = termFilter(XI_TERMS);
export const ICE_FILTER = '(topic_key.eq.ice,category_name.eq.ICE,category_name.eq.ICE执法动态,category_name.eq.ICE执法,category_name.eq.ICE执法追踪,category_name.eq.ICE新闻,category_name.eq.驱逐快报)';
export const ENFORCEMENT_FILTER = `(${ICE_FILTER.slice(1, -1)},category_name.eq.美国警情,category_name.eq.美国执法与警情,category_name.eq.ICE执法与警情)`;
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
