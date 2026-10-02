// Collection eligibility is separate from source trust and publication permission.
const US = /\b(?:U\.?S\.?|United States|American|Congress|White House|ICE|ERO|HSI|DHS|CBP|USCIS|FBI|DOJ|IRS|SEVIS|H-?1B|F-?1)\b|美国|美國|白宫|白宮|国会|國會|移民与海关|国土安全|美方|特朗普|川普/i;
const CHINA = /\b(?:China|Chinese government|Beijing|CCP|Xi Jinping)\b|中国|中國|中共|中南海|习近平|習近平|国务院|國務院|中央军委|中央軍委|中纪委|中紀委|全国人大|全國人大/i;
const POLITICS = /government|president|congress|senate|election|executive order|legislation|bill\b|policy|regulation|sanction|tariff|budget|hearing|vote|white house|国务院|领导|領導|常委|政治|官员|官員|人事|免职|免職|任免|调查|調查|反腐|政策|法案|行政命令|国会|國會|总统|總統|制裁|关税|關稅|财政|財政|选举|選舉|台海|人权|人權|国家安全|國家安全|间谍|間諜|海警|科考船|主权|主權|参议员|參議員/i;
const COURT = /court|judge|ruling|injunction|precedent|appellate|tribunal|判决|判決|法院|法官|裁定|判例|禁令|上诉|上訴/i;
const ACTION = /announc|issu(?:e[ds]?|ing)|publish|releas|adopt|approv|block|rul(?:e[ds]?|ing)|file[ds]?|order|sign(?:ed|s|ing)?|enact|propos|vot(?:e[ds]?|ing)|appeal|upheld|denied|grant|stay|indict|charg|arrest(?:ed|s|ing)\b|detain(?:ed|s|ing)\b|sentenc|convict|deport|remov|investigat|launch|rescued|recover|seiz|took into custody|宣布|发布|發布|颁布|頒布|通过|通過|裁定|判决|判決|起诉|起訴|批准|生效|上诉|上訴|调查|調查|任免|免职|免職|拘捕|逮捕|拘留|遣返|查获|查獲|判刑|开庭|開庭|修订|修訂|听证|聽證|驱离|驅離|驱赶|驅趕|警告|呼吁|呼籲|致函/i;
const AGENCY = /\b(?:ICE|ERO|HSI|DHS|CBP|USCIS|FBI|DOJ|IRS)\b|Department of Justice|Department of Homeland Security|police|sheriff|border patrol|移民与海关|移民與海關|国土安全|國土安全|联邦调查局|聯邦調查局|美国警方|美國警方|司法部|检察官|檢察官|检方|檢方|prosecutor/i;
const READER = /Chinese Americans?|Chinese nationals?|Chinese students?|Asian Americans?|immigration|immigrant|visa|green card|asylum|naturalization|SEVIS|H-?1B|F-?1|student visa|tax filing|华人|華人|华裔|華裔|中国公民|中國公民|留学生|留學生|移民|签证|簽證|绿卡|綠卡|庇护|庇護|工卡|报税|報稅/i;

// Court names, presidents, police and source trust alone do not establish US geography.
const FOREIGN = /Russia|Russian|Moscow|Sochi|Kremlin|United Kingdom|British|France|French|Germany|German|India|Indian|Brazil|South Africa|俄罗斯|俄羅斯|俄国|俄國|莫斯科|索契|克里姆林|英国|英國|法国|法國|德国|德國|印度|巴西|南非/i;
const EXPLICIT_US = /\b(?:U\.?S\.?|United States|American|White House|ICE|ERO|HSI|DHS|CBP|USCIS|FBI|DOJ|IRS|Trump|Biden|New York|California|Los Angeles|San Francisco|Texas|Florida)\b|美国|美國|美方|白宫|白宮|特朗普|川普|拜登|纽约|紐約|加州|洛杉矶|洛杉磯|旧金山|舊金山|德州|佛罗里达|佛羅里達/i;
function eventText(text) { return String(text || '').replace(/美国之音|美國之音|Voice of America/gi, ''); }
function hasGeographicNexus(text) { const value = eventText(text); return EXPLICIT_US.test(value) || CHINA.test(value); }

function collectionScope(text, row = {}) {
  const value = eventText(text);
  if (FOREIGN.test(value) && !hasGeographicNexus(value)) return null;
  if (!ACTION.test(value)) return null;
  const official = /^(official|government|agency)$/.test(String(row.source_type || '')) && Number(row.trust_tier) === 1;
  if (hasGeographicNexus(value) && EXPLICIT_US.test(value) && AGENCY.test(value) && /性侵|强奸|強姦|刑事|逮捕|拘捕|prosecutor/i.test(value)) return {key:'us-crime', reason:'US criminal investigation', researchPriority:true};
  if (US.test(value) && COURT.test(value)) return {key:'us-politics', reason:'US court development', researchPriority:true};
  if (US.test(value) && POLITICS.test(value)) return {key:'us-politics', reason:'US political or policy development', researchPriority:true};
  if (CHINA.test(value) && (POLITICS.test(value) || COURT.test(value))) return {key:'china', reason:'China political development', researchPriority:true};
  if ((US.test(value) || official) && AGENCY.test(value)) return {key:'us-crime', reason:'law-enforcement development', researchPriority:COURT.test(value) || READER.test(value) || /policy|规则|政策|\b\d{3,}\b|死亡|shooting|fatal/i.test(value)};
  if (US.test(value) && READER.test(value)) return {key:'us-politics', reason:'documentable Chinese-reader impact', researchPriority:true};
  return null;
}
module.exports = { collectionScope, hasGeographicNexus };
