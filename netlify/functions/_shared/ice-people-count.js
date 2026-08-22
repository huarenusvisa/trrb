"use strict";

const MAX_SINGLE_EVENT = 500;
const APPROXIMATE = /(?:约|大约|近|approximately|about|nearly)/i;
const MINIMUM = /(?:至少|超过|逾|不低于|at least|more than|over)/i;
const REMOVAL = /(?:遣返|递解|驱逐出境|遣送|送返|deport|remov|repatriat)/i;
const ARREST = /(?:逮捕|抓捕|拘捕|拘留|羁押|扣押|被捕|arrest|detain|apprehend|custody|held)/i;
const NON_EVENT_CONTEXT = /(?:反遣返|抗议|示威|游行|倡议|集会|protest|rally|demonstration)/i;

function normalizeSource(input) {
  const raw = typeof input === "string"
    ? input
    : [input?.title, input?.summary, input?.content].filter(Boolean).join("。");
  return String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b20\d{2}[\/-]\d{1,2}[\/-]\d{1,2}\b/g, " ")
    .replace(/20\d{2}年\d{1,2}月\d{1,2}日/g, " ")
    .replace(/\b20\d{2}年/g, " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
    .replace(/\b\d{5}(?:-\d{4})?\b/g, " ")
    .replace(/\bA#?\s*\d+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countKind(text) {
  if (APPROXIMATE.test(text)) return "estimated";
  if (MINIMUM.test(text)) return "minimum";
  return "exact";
}

function resultFromMatch(match) {
  if (match && NON_EVENT_CONTEXT.test(match[0])) return null;
  const value = Number(match?.[1] || 0);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_SINGLE_EVENT) return null;
  return {
    value,
    kind: countKind(match[0]),
    matchedText: String(match[0] || "").trim()
  };
}

function extractPeopleCount(input) {
  const source = normalizeSource(input);
  const patterns = [
    /(?:逮捕|抓捕|拘捕|拘留|羁押|扣押|带走|押送|遣返|递解|驱逐出境|遣送|送返|移送|搭载|载有|运送)(?:了|了约|约|大约|近|至少|超过|逾|不低于)?\s*(\d{1,3})\s*(?:名|人|位)/,
    /(?:约有|约|大约|近|至少|超过|逾|不低于)?\s*(\d{1,3})\s*(?:名|人|位)(?:非法移民|移民|男子|女子|嫌疑人|人员|公民|旅客|乘客)?[^。；;，,]{0,20}?(?:被逮捕|被抓捕|被拘捕|被捕|被拘留|遭拘留|被羁押|被扣押|被带走|被押送|被遣返|遭遣返|被递解|遭递解|被驱逐出境|被遣送|被送返|落网|遣返|递解|驱逐出境|遣送|送返|移送)/,
    /\b(?:arrested|detained|apprehended|held|deported|removed|repatriated|transported|carried)\s+(?:approximately\s+|about\s+|nearly\s+|at least\s+|more than\s+|over\s+)?(\d{1,3})\s+(?:people|persons|men|women|migrants|immigrants|individuals|detainees|passengers)\b/i,
    /\b(?:approximately\s+|about\s+|nearly\s+|at least\s+|more than\s+|over\s+)?(\d{1,3})\s+(?:people|persons|men|women|migrants|immigrants|individuals|detainees|passengers)[^.!?]{0,30}\b(?:were\s+|was\s+)?(?:arrested|detained|apprehended|held|deported|removed|repatriated|transported)\b/i
  ];

  for (const pattern of patterns) {
    const parsed = resultFromMatch(source.match(pattern));
    if (parsed) return parsed;
  }

  const one = source.match(/(?:逮捕|抓捕|拘捕|拘留|羁押|扣押|带走|押送|遣返|递解|驱逐|遣送|送返|移送|搭载|载有|运送)[^。；;.!?]{0,12}(?:一名|一位|一人|一男子|一女子)/i)
    || source.match(/(?:一名|一位|一人|一男子|一女子|one person|one man|one woman|a man|a woman|a detainee|an immigrant)[^。；;.!?]{0,24}(?:拘留|羁押|被捕|逮捕|抓捕|拘捕|带走|押送|遣返|递解|驱逐|detain|arrest|custody|apprehend|deport|remove)/i);
  if (one && !NON_EVENT_CONTEXT.test(one[0])) return { value: 1, kind: "exact", matchedText: one[0].trim() };

  const two = source.match(/(?:逮捕|抓捕|拘捕|拘留|羁押|扣押|带走|押送|遣返|递解|驱逐|遣送|送返|移送|搭载|载有|运送)[^。；;.!?]{0,12}(?:两名|两位|两人)/i)
    || source.match(/(?:两名|两位|两人|two people|two men|two women)[^。；;.!?]{0,24}(?:拘留|羁押|被捕|逮捕|抓捕|拘捕|带走|押送|遣返|递解|驱逐|detain|arrest|custody|apprehend|deport|remove)/i);
  if (two && !NON_EVENT_CONTEXT.test(two[0])) return { value: 2, kind: "exact", matchedText: two[0].trim() };

  return { value: 0, kind: "unknown", matchedText: "" };
}

function buildPeopleCountMetadata(input) {
  const result = extractPeopleCount(input);
  if (!result.value) return {};
  const source = normalizeSource(input);
  const eventType = String(input?.event_type || "");
  const classificationText = `${eventType} ${result.matchedText} ${source.slice(0, 500)}`;
  return {
    people_count: result.value,
    people_count_type: result.kind,
    people_count_source: "published_text",
    ...(REMOVAL.test(classificationText) ? { removed_count: result.value } : {}),
    ...(!REMOVAL.test(classificationText) && ARREST.test(classificationText) ? { arrested_count: result.value } : {})
  };
}

module.exports = {
  MAX_SINGLE_EVENT,
  normalizeSource,
  extractPeopleCount,
  buildPeopleCountMetadata
};
