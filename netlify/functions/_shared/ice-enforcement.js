"use strict";

const ICE_AGENCY_PHRASES = [
  "移民与海关执法局",
  "移民和海关执法局",
  "美国移民海关执法局",
  "美国移民与海关执法局",
  "美国移民和海关执法局",
  "ice执法人员",
  "ice探员",
  "ice特工",
  "ice官员",
  "ice发言人",
  "ice拘留中心",
  "ice.gov",
  "@icegov",
  "enforcement and removal operations"
];

const ICE_ACTION_PHRASES = [
  "抓捕", "抓获", "拘捕", "逮捕", "拘留", "拘押", "羁押", "遣返", "递解",
  "驱逐出境", "强制离境", "突袭", "搜捕", "通缉", "扫荡", "执法行动", "查获", "扩大执法",
  "移交ice", "ice羁押", "ice拘留", "ice逮捕", "ice拘捕", "ice遣返",
  "ice突袭", "ice搜查", "ice通缉", "arrest", "detain", "detention",
  "deport", "removal", "raid", "custody", "fugitive", "warrant", "enforcement operation"
];

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function hasStandaloneIce(text) {
  return /(^|[^a-z0-9])ice(?=$|[^a-z0-9])/i.test(text);
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(normalize(term)));
}

function hasEroHandleMention(text) {
  return /(^|[^a-z0-9])@?ero[a-z0-9_]*(?=$|[^a-z0-9])/i.test(String(text || ""));
}

const ICE_NATIVE_SOURCE = /^(icegov|ero[a-z0-9_]*|ice[a-z0-9_]*)$/i;
const ICE_POLICY_ONLY = /\b(abolish|defund|dismantle|eliminate|replace|vote(?:d|s|ing)?|proposal|campaign|protest(?:ed|s|ing)?)\b.{0,40}\bice\b|\bice\b.{0,40}\b(abolish|defund|dismantle|eliminate|replace|proposal|campaign|protest(?:ed|s|ing)?)\b/i;

function isIceEnforcementText(...values) {
  const text = normalize(values.filter(Boolean).join(" "));
  if (!text) return false;
  const agency = hasStandaloneIce(text) || hasAny(text, ICE_AGENCY_PHRASES) || hasEroHandleMention(text);
  const action = hasAny(text, ICE_ACTION_PHRASES);
  return agency && action;
}

function isIceEnforcementEvidence(value, sourceUsername = "") {
  const text = normalize(value);
  if (!text || ICE_POLICY_ONLY.test(text)) return false;
  if (isIceEnforcementText(text)) return true;
  const username = String(sourceUsername || "").replace(/^@/, "");
  return ICE_NATIVE_SOURCE.test(username) && isIceEnforcementText("ICE", text);
}

module.exports = {
  ICE_AGENCY_PHRASES,
  ICE_ACTION_PHRASES,
  hasStandaloneIce,
  hasEroHandleMention,
  isIceEnforcementText,
  isIceEnforcementEvidence
};
