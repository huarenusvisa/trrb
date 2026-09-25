const { collectionScope } = require('./news-collection-scope');
const { isIceEnforcementText } = require('./ice-enforcement');

function normalize(...values) {
  return values.join(' ').normalize('NFKC').toLowerCase()
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function has(text, pattern) { return pattern.test(text); }
function knowledge(category, topic, reason) {
  return {
    key: 'immigration-knowledge',
    categoryName: `移民美国·${category}·${topic}·官方政策动态`,
    topicKey: null,
    knowledgeCategory: category,
    knowledgeTopic: topic,
    reason
  };
}

function routeOfficialContent(title, summary, content, evidence = []) {
  const sourceText = evidence.map(post => `${post?.source_username || ''} ${post?.source_display_name || ''} ${post?.source_text || ''}`).join(' ');
  const text = normalize(title || '', summary || '', String(content || '').slice(0, 2400), sourceText);

  if (isIceEnforcementText(title, `${summary || ''} ${String(content || '').slice(0, 1200)} ${sourceText}`)) {
    return { key: 'ice', categoryName: 'ICE执法动态', topicKey: 'ice', reason: 'ICE agency and concrete enforcement action' };
  }

  if (has(text, /\bi-?485\b|境内调整身份|adjustment of status/)) return knowledge('境内身份转换', 'I-485境内调整身份', 'I-485 or adjustment-of-status policy');
  if (has(text, /\bi-?130a?\b|petition for alien relative|亲属移民申请/)) return knowledge('家庭移民', 'I-130亲属移民申请', 'I-130 family petition policy');
  if (has(text, /\bi-?140\b|immigrant petition for alien workers?/)) return knowledge('职业移民', 'I-140职业移民申请', 'I-140 employment petition policy');
  if (has(text, /\bi-?589\b|affirmative asylum|庇护申请|庇护面谈/)) return knowledge('人道主义庇护', '政治庇护', 'asylum application policy');
  if (has(text, /\bi-?765\b|employment authorization|\bead\b|工卡/)) return knowledge('境内身份转换', 'EAD工卡', 'employment authorization policy');
  if (has(text, /\bi-?131\b|advance parole|旅行许可|回美证/)) return knowledge('境内身份转换', 'Advance Parole旅行许可', 'travel document policy');
  if (has(text, /\bn-?400\b|naturalization|入籍申请/)) return knowledge('入籍美国公民', 'N-400入籍申请', 'naturalization policy');
  if (has(text, /\bn-?600\b|certificate of citizenship|公民证明/)) return knowledge('入籍美国公民', 'N-600公民证明', 'citizenship certificate policy');
  if (has(text, /\bh-?1b\b/)) return knowledge('赴美工作', 'H-1B专业工作', 'H-1B policy');
  if (has(text, /\bf-?1\b|\bi-?20\b|\bsevis\b/)) return knowledge('赴美留学', 'F-1学生签证', 'F-1 student policy');
  if (has(text, /\beb-?2\b.*\bniw\b|国家利益豁免|\bniw\b/)) return knowledge('职业移民', 'EB-2 NIW', 'NIW policy');
  if (has(text, /\buscis\b|美国公民及移民服务局|移民局/)) return knowledge('境内身份转换', 'USCIS政策与表格', 'general USCIS policy or form update');

  const scope = collectionScope(text);
  if (scope?.key === 'china') return {key:'china',categoryName:'中国热门头条',topicKey:null,reason:scope.reason};
  const criminalAction = has(text, /逮捕|拘捕|被捕|起诉|刑事指控|枪击|命案|谋杀|诈骗|贩毒|绑架|搜查令|通缉|arrest|indict|criminal charge|shooting|murder|fraud|drug trafficking|warrant/);
  const criminalAgency = has(text, /\bfbi\b|联邦调查局|司法部|\bdoj\b|检察官|警察|警方|警长|sheriff|police|prosecutor/);
  if (criminalAction && criminalAgency) {
    return { key: 'us-crime', categoryName: '美国警情', topicKey: null, reason: 'US criminal investigation or police action' };
  }

  if (scope?.key === 'us-politics' || has(text, /白宫|国会|参议院|众议院|总统|州长|行政命令|最高法院|联邦法院|法案|听证会|政府政策|政策调整|rule|regulation|policy|congress|white house|supreme court/)) {
    return { key: 'us-politics', categoryName: '美国时政', topicKey: null, reason: 'US government, court or public-policy development' };
  }

  if (scope) return {key:scope.key,categoryName:scope.key === 'us-crime' ? '美国警情' : '美国时政',topicKey:null,reason:scope.reason};
  return null;
}

module.exports = { routeOfficialContent };
