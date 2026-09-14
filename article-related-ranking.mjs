// Shared, deterministic ranking for the existing article reading experience.
// Broad section names and country names are not evidence of a relationship.
const STOP = new Set(('美国 中国 华人 新闻 报道 唐人 日报 最新 今日 日前 近日 当地 记者 表示 认为 相关 事件 情况 问题 发生 进行 发布 公布 引发 关注 网友 视频 消息 社会 人员 政府 工作 可能 已经 目前 因为 这个 一个 他们 我们 以及 之后 此前 此次 当天 今年 去年 纽约 加州 特朗普 川普 总统 法官 法院 警方 学生 学校 公司 员工 移民 拘留 逮捕 ICE FBI DHS Trump the and for with from that this').toLowerCase().split(/\s+/));
for (const word of '持有 管制 规定 信息 官员 涉嫌 意图 分发 公布 提供 拘捕 非法 年度 计划 宣布 洛杉矶 洛杉 西雅图 西雅 德州 加利福尼亚 佛罗里达 弗吉尼亚 吉尼亚 萨尔瓦多 萨尔 瓦多 形容 密集 教学 人民 通过 要求 决定 未来 继续'.split(' ')) STOP.add(word);
const NAMES = ['胖东来', '于东来', '南通中集', '奥斯马', 'Ticketmaster', 'Live Nation', 'USCIS', 'EOIR'];
const FACETS = [
  ['庇护工卡与时钟', /庇护.{0,12}(时钟|停表|工卡)|(?:i[- ]?765|c08|ead).{0,20}(庇护|时钟|停表)/i],
  ['庇护申请费用', /(?:i[- ]?589|庇护).{0,16}(费用|收费|缴费|年费)|年度庇护费/i],
  ['移民拘留与释放', /(?:ice|移民).{0,20}(拘留|保释|释放|羁押)|人身保护令/i],
  ['ICE执法案件', /ice.{0,30}(拘捕|逮捕|拘留|遣返|执法)|(?:拘捕|逮捕|拘留|遣返).{0,12}移民/i],
  ['毒品案件', /毒品|毒贩|管制物质|贩毒/],
  ['签证撤销', /签证.{0,12}(撤销|吊销|取消)|撤签|撤销.{0,12}签证/i],
  ['劳动报酬', /欠薪|讨薪|工资条|拖欠工资|加班费|最低工资/],
  ['校园管理', /(?:学校|校园|教学楼|高中).{0,20}(栅栏|封闭|管理|围栏)|坐姿矫正/],
  ['电信诈骗', /电诈|电信诈骗|诈骗园区|诈骗窝点/],
  ['关税政策', /关税|贸易协定|贸易战/],
  ['食品安全', /食物中毒|食品安全|卫生违规|食品召回/],
  ['住房租赁', /租金|租客|房租|租赁|出租|房东/],
];
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
export function plain(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}
export function tokens(value) {
  const text = plain(value), result = new Set();
  for (const name of NAMES) if (text.includes(name.toLowerCase())) result.add(name.toLowerCase());
  const parts = segmenter ? Array.from(segmenter.segment(text), x => x.isWordLike ? x.segment : '') : (text.match(/[\p{Script=Han}]{2,}|[a-z][a-z0-9-]+/gu) || []);
  for (const part of parts) {
    if (part.length < 2 || STOP.has(part) || /^\d+$/.test(part)) continue;
    result.add(part);
    if (/^[\p{Script=Han}]{4,}$/u.test(part)) {
      for (let i = 0; i < part.length - 2; i++) {
        const term = part.slice(i, i + 3);
        if (!STOP.has(term)) result.add(term);
      }
    }
  }
  for (const code of text.match(/\b(?:i|n|ds|h|f|eb)[- ]?\d{1,4}[a-z]?\b/g) || []) result.add(code.replace(/ /g, '-'));
  return result;
}
function titleKey(article) { return plain(article.title).replace(/[^\p{L}\p{N}]/gu, ''); }
function features(article) {
  const text = `${article.title || ''} ${article.summary || article.excerpt || ''}`;
  return { terms: tokens(text), title: tokens(article.title), facets: FACETS.filter(([, pattern]) => pattern.test(text)).map(([label]) => label) };
}
export function isPublic(article, now = Date.now()) {
  const date = Date.parse(article.published_at || article.created_at || '');
  return Boolean(article.id && article.title) && (!article.status || article.status === 'published')
    && (!article.visibility || article.visibility === 'public') && !article.hidden_at && !article.archived_at
    && (!Number.isFinite(date) || date <= now);
}
export function searchTerms(article) {
  return [...tokens(article.title)].sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, 3);
}
export function rankRelated(anchor, candidates, { seen = [], last = anchor, limit = 12, now = Date.now() } = {}) {
  const excluded = new Set([String(anchor.id), ...seen.map(String)]);
  const anchorFeatures = features(anchor), lastFeatures = features(last);
  const publicRows = candidates.filter(row => isPublic(row, now));
  const frequency = new Map();
  for (const row of publicRows) for (const token of features(row).terms) frequency.set(token, (frequency.get(token) || 0) + 1);
  function relation(a, b) {
    const common = [...a.terms].filter(term => b.terms.has(term));
    const titles = common.filter(term => a.title.has(term) && b.title.has(term));
    const facets = a.facets.filter(facet => b.facets.includes(facet));
    const specific = titles.filter(term => term.length >= 3);
    if (!facets.length && !(common.length >= 3 && titles.length >= 2) && !specific.length) return null;
    const score = common.reduce((sum, term) => sum + Math.log(2 + publicRows.length / (1 + (frequency.get(term) || 0))) * (titles.includes(term) ? 2 : 1), 0) + facets.length * 7;
    return { score, reason: facets[0] ? `相关主题：${facets[0]}` : '相关报道' };
  }
  const ranked = publicRows.flatMap(article => {
    if (excluded.has(String(article.id)) || titleKey(article) === titleKey(anchor) || titleKey(article) === titleKey(last)) return [];
    const match = relation(anchorFeatures, features(article));
    // Every article must stay relevant to the entry story; last-read context only reorders it.
    if (!match) return [];
    const recent = relation(lastFeatures, features(article));
    const age = Math.max(0, now - Date.parse(article.published_at || article.created_at || '')) / 86400000;
    return [{ article, reason: match.reason, score: match.score + (recent?.score || 0) * .2 + (Number.isFinite(age) ? 1 / (1 + age / 7) : 0) }];
  }).sort((a, b) => b.score - a.score || String(a.article.id).localeCompare(String(b.article.id)));
  const ids = new Set(), titles = new Set();
  return ranked.filter(({ article }) => {
    const id = String(article.id), title = titleKey(article);
    if (ids.has(id) || titles.has(title)) return false;
    ids.add(id); titles.add(title); return true;
  }).slice(0, limit);
}
