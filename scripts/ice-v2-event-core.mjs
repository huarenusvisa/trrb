import crypto from "node:crypto";

const STOP = new Set([
  "the","and","for","with","from","that","this","into","after","before","about","their","they","them","said","says","according","official","officials","department","agency","today","yesterday","news","breaking","update",
  "一个","一名","有关","相关","已经","正在","表示","指出","消息","报道","记者","目前","此次","进行","以及","其中","美国","新闻","发布","通报","当地","人员","事件"
]);

const ACTIONS = [
  ["removal_flight", /removal flight|deportation flight|遣返航班|驱逐航班/i],
  ["deportation", /deport|deported|deportation|removed from the united states|遣返|驱逐出境/i],
  ["raid", /raid|operation|enforcement action|突袭|执法行动|联合行动/i],
  ["detention", /detain|detained|detention|custody|拘留|羁押/i],
  ["arrest", /arrest|apprehend|taken into custody|逮捕|抓捕/i],
  ["court", /court|judge|injunction|lawsuit|hearing|法院|法官|诉讼|禁令/i],
  ["policy", /policy|executive order|agreement|287\(g\)|政策|行政令|协议/i],
  ["facility", /facility|detention center|processing center|拘留中心|设施/i]
];

const STATES = new Map([
  ["alabama","AL"],["alaska","AK"],["arizona","AZ"],["arkansas","AR"],["california","CA"],["colorado","CO"],["connecticut","CT"],["delaware","DE"],["florida","FL"],["georgia","GA"],["hawaii","HI"],["idaho","ID"],["illinois","IL"],["indiana","IN"],["iowa","IA"],["kansas","KS"],["kentucky","KY"],["louisiana","LA"],["maine","ME"],["maryland","MD"],["massachusetts","MA"],["michigan","MI"],["minnesota","MN"],["mississippi","MS"],["missouri","MO"],["montana","MT"],["nebraska","NE"],["nevada","NV"],["new hampshire","NH"],["new jersey","NJ"],["new mexico","NM"],["new york","NY"],["north carolina","NC"],["north dakota","ND"],["ohio","OH"],["oklahoma","OK"],["oregon","OR"],["pennsylvania","PA"],["rhode island","RI"],["south carolina","SC"],["south dakota","SD"],["tennessee","TN"],["texas","TX"],["utah","UT"],["vermont","VT"],["virginia","VA"],["washington","WA"],["west virginia","WV"],["wisconsin","WI"],["wyoming","WY"]
]);

export function cleanText(value) {
  return String(value ?? "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[A-Za-z0-9_]{1,15}/g, " ")
    .replace(/[#*_`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function removeRepeatedSegments(value) {
  const pieces = String(value ?? "").split(/(?<=[.!?。！？])\s+|\n+/).map(cleanText).filter(Boolean);
  const seen = new Set();
  return pieces.filter((part) => {
    const key = part.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(" ");
}

export function detectAction(value) {
  const text = cleanText(value);
  return ACTIONS.find(([, pattern]) => pattern.test(text))?.[0] || "other";
}

export function detectState(value) {
  const text = ` ${cleanText(value).toLowerCase()} `;
  for (const [name, code] of STATES) if (text.includes(` ${name} `)) return code;
  const code = text.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i)?.[1];
  return code ? code.toUpperCase() : "";
}

export function keywordSet(value, limit = 36) {
  const text = cleanText(value).toLowerCase();
  const score = new Map();
  const add = (word, weight = 1) => {
    const token = word.trim();
    if (!token || STOP.has(token) || /^\d+$/.test(token) || token.length < 2 || token.length > 30) return;
    score.set(token, (score.get(token) || 0) + weight);
  };
  for (const word of text.match(/[a-z][a-z0-9'-]{2,}/g) || []) add(word, word.length > 6 ? 3 : 2);
  for (const run of text.match(/[\u3400-\u9fff]{2,24}/g) || []) {
    if (run.length <= 8) add(run, 5);
    for (const size of [2,3,4]) for (let i = 0; i <= run.length - size; i += 1) add(run.slice(i, i + size), size);
  }
  return [...score.entries()].sort((a,b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, limit).map(([word]) => word);
}

export function eventProfile(post) {
  const text = removeRepeatedSegments(post?.source_text || post?.text || "");
  return {
    day: String(post?.source_created_at || post?.created_at || "").slice(0,10),
    action: post?.event_type && post.event_type !== "other" ? post.event_type : detectAction(text),
    state: post?.state_code || detectState(text),
    city: String(post?.city || "").trim().toLowerCase(),
    keywords: keywordSet(text),
    text
  };
}

export function eventFingerprint(profile) {
  const stable = [profile.day, profile.state, profile.city, profile.action, ...profile.keywords.slice(0,12).sort()].join("|");
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0,40);
}

function jaccard(left, right) {
  const a = new Set(left || []), b = new Set(right || []);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const item of a) if (b.has(item)) common += 1;
  return common / (a.size + b.size - common);
}

export function eventSimilarity(a, b) {
  if (a.day && b.day && a.day !== b.day) return 0;
  if (a.state && b.state && a.state !== b.state) return 0;
  if (a.action !== "other" && b.action !== "other" && a.action !== b.action) return 0;
  const keyword = jaccard(a.keywords, b.keywords);
  const textA = cleanText(a.text).toLowerCase(), textB = cleanText(b.text).toLowerCase();
  const containment = textA.length > 70 && textB.length > 70 && (textA.includes(textB) || textB.includes(textA)) ? 1 : 0;
  const locationBonus = a.state && b.state && a.state === b.state ? 0.12 : 0;
  const cityBonus = a.city && b.city && a.city === b.city ? 0.1 : 0;
  return Math.min(1, Math.max(keyword, containment) + locationBonus + cityBonus);
}

export function sameEvent(a, b, threshold = 0.56) {
  return eventSimilarity(a, b) >= threshold;
}
