const { isIceEnforcementText } = require("./ice-enforcement");

const US_CONTEXT_TERMS = [
  "美国", "赴美", "入境美国", "移民美国", "美国移民", "美国签证", "美签",
  "u.s. immigration", "united states immigration"
];

const US_SPECIFIC_IMMIGRATION_TERMS = [
  "uscis", "美国公民及移民服务局", "eoir", "bia", "移民上诉委员会", "matter of",
  "绿卡", "永久居民", "入籍", "归化", "调整身份", "身份调整", "工卡", "ead",
  "advance parole", "回美证", "再入境许可", "移民法庭", "移民法官", "移民签证",
  "签证公告", "排期", "nvc", "领事馆面签", "daca", "tps", "临时保护身份",
  "i-130", "i130", "i-485", "i485", "i-589", "i589", "i-765", "i765",
  "i-864", "i864", "i-140", "i140", "i-20", "i20", "ds-260", "ds260",
  "n-400", "n400", "n-600", "n600", "sevis", "cpt", "stem opt",
  "h-1b", "h1b", "l-1", "l1签证", "o-1", "o1签证", "h-2a", "h-2b",
  "tn签证", "e-1", "e-2", "r-1", "eb-1", "eb1", "eb-2", "eb2", "niw",
  "perm", "eb-3", "eb3", "eb-4", "eb4", "eb-5", "eb5", "f-1", "f1学生",
  "j-1", "m-1", "k-1", "cr-1", "ir-1", "f2a", "婚姻绿卡", "政治庇护",
  "庇护申请", "庇护面谈", "庇护时钟", "vawa", "u签证", "t签证", "sijs"
];

const GENERIC_IMMIGRATION_PROCESS_TERMS = [
  "签证", "移民申请", "身份转换", "庇护", "留学", "工作移民", "家庭移民",
  "亲属移民", "职业移民", "学生签证", "工作签证", "公民申请"
];

const NON_PROCESS_EVENT_TERMS = [
  "抓捕", "抓获", "拘捕", "逮捕", "被捕", "拘留", "拘押", "羁押", "查获",
  "突袭", "搜捕", "破获", "起诉", "遣返", "递解", "驱逐", "强制离境", "诈骗案", "欺诈案", "性侵",
  "杀害", "谋杀", "犯罪者", "犯罪飙升", "警方", "执法部门", "拒配合ice",
  "举报移民欺诈", "追责提交虚假"
];

function normalizeText(title, lead) {
  return `${String(title || "")} ${String(lead || "").slice(0, 1200)}`
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function isUsImmigrationText(title, lead) {
  if (isIceEnforcementText(title, lead)) return false;
  const text = normalizeText(title, lead);
  if (containsAny(text, NON_PROCESS_EVENT_TERMS)) return false;
  if (containsAny(text, US_SPECIFIC_IMMIGRATION_TERMS)) return true;
  return containsAny(text, US_CONTEXT_TERMS)
    && containsAny(text, GENERIC_IMMIGRATION_PROCESS_TERMS);
}

module.exports = {
  isUsImmigrationText,
  US_CONTEXT_TERMS,
  US_SPECIFIC_IMMIGRATION_TERMS,
  GENERIC_IMMIGRATION_PROCESS_TERMS,
  NON_PROCESS_EVENT_TERMS
};
