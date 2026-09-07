#!/usr/bin/env node
import process from "node:process";
import { pathToFileURL } from "node:url";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const LOOKBACK_HOURS = Number(process.env.ICE_NEWS_QUALITY_LOOKBACK_HOURS || 8);
const MAX_ROWS = Number(process.env.ICE_NEWS_QUALITY_MAX || 4000);

const NATIVE_HANDLE = /^(icegov|dhsgov|hsi_hq|cbp|usbpchief|uscis|ero[a-z0-9_]*|ice[a-z0-9_]*|dhs[a-z0-9_]*|cbp[a-z0-9_]*|usbp[a-z0-9_]*|uscis[a-z0-9_]*|hsi[a-z0-9_]*)$/i;
const NOISE = /ice cream|iced latte|iced coffee|ice tea|ice cube|ice cubes|ice hockey|hockey|ice wizard|ice spice|ice rink|skating|frost invasion|operation ice\b|glacier|espresso|beverage|product shot|summer joy|waffle cone|salted caramel/i;
const ACRONYM_AGENCY = /\b(?:ICE|ERO|HSI|DHS|CBP)\b/;
const AGENCY_PHRASE = /immigration and customs enforcement|enforcement and removal operations|homeland security investigations|department of homeland security|customs and border protection|border patrol|immigration agents?|immigration officers?|deportation officers?|移民与海关执法局|移民和海关执法局|移民局特工|移民执法人员|国土安全调查局|边境巡逻/i;
const STRONG_AGENCY_ACTION = /\bice\s+(?:agents?|officers?|officials?|raid|arrest|detention|operation|deportation|director)\b|\bero\b|\bhsi\b|immigration and customs enforcement|homeland security investigations/i;
const LOWERCASE_ICE_WITH_IMMIGRATION = /\bice\b/i;
const IMMIGRATION = /immigration|immigrant|migrant|undocumented|illegal alien|illegal immigrant|deport|removal|asylum|border|visa|green card|移民|非法入境|无证|庇护|边境|遣返|递解|驱逐/i;
const CONCRETE_ACTION = /arrest(?:ed|s|ing)?|apprehend(?:ed|s|ing)?|detain(?:ed|s|ing)?|detention|taken into custody|raid(?:ed|s|ing)?|execut(?:e|ed|ing)|operation (?:is )?(?:underway|launched)|deport(?:ed|s|ing)?|removal flight|repatriat(?:e|ed|ion)|warrant|fugitive|custody|charged|indicted|sentenced|convicted|released|rescued|recovered|traffick|smuggl|shooting|shot by|killed by|fatal|death|use of force|vehicle stop|worksite enforcement|抓捕|抓获|拘捕|逮捕|拘留|拘押|羁押|带走|抓走|遣返|递解|驱逐|突袭|搜捕|扫荡|执法行动|查获|起诉|判刑|释放|枪击|开枪|死亡|身亡|营救|人口贩卖|走私/i;
const JUDICIAL_UPDATE = /judge|court|ruling|ruled|motion to dismiss|lawsuit|indictment|indicted|charged|sentenced|order(?:ed)?|hearing|appeal|法院|法官|裁定|判决|诉讼|起诉|判刑|上诉/i;
const HYPOTHETICAL_OR_OPINION = /\bshould\b|\bcould\b|\bwould\b|\bhope\b|\bwant\b|\bneeds? to\b|perfect location for an ice raid|good job ice|ice hasn'?t been|abolish ice|defund ice|support ice|oppose ice|fuck ice|fuck trump|why are .* mad|badge does not make/i;
const ANTI_ICE_PROTEST = /anti[- ]ice|ice watch|protest(?:er|ers|ing)? against ice|anti ice/i;
const FRESH_UPDATE = /breaking|just in|today|tonight|this morning|this afternoon|currently|right now|now underway|announced|new charges|new arrest|new raid|new operation|new ruling|just arrested|just detained|正在|刚刚|今天|今日|最新|宣布|新一轮|新行动|新逮捕|新裁定/i;

function headers(prefer = "") {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}
function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}
async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  const response = await fetch(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || payload?.details || payload?.hint || payload?.raw || `Supabase请求失败：${response.status}`);
  return payload;
}

function staleRecap(text) {
  const value = String(text || "");
  const matches = [...value.matchAll(/\b(\d{1,3})\s+(days?|weeks?|months?|years?)\s+ago\b/gi)];
  for (const match of matches) {
    const n = Number(match[1]);
    const unit = String(match[2]).toLowerCase();
    if ((unit.startsWith("day") && n >= 3) || (unit.startsWith("week") && n >= 2) || unit.startsWith("month") || unit.startsWith("year")) return true;
  }
  return /\blast year\b|\bin 2025\b|\b2025 arrest\b|\bmonths later\b|\b60 days later\b|\b90 days later\b|几个月前|数月前|去年|2025年/i.test(value);
}
function hasAgencyContext(text) {
  return ACRONYM_AGENCY.test(text) || AGENCY_PHRASE.test(text) || (LOWERCASE_ICE_WITH_IMMIGRATION.test(text) && IMMIGRATION.test(text));
}

export function classifyNewsQuality(row) {
  const text = String(row?.source_text || "");
  const username = String(row?.source_username || "").replace(/^@/, "").trim();
  const type = String(row?.source_type || "").trim();
  const native = NATIVE_HANDLE.test(username) || /^(official|government|agency)$/i.test(type);
  const agency = hasAgencyContext(text);
  const concrete = CONCRETE_ACTION.test(text);
  const judicial = JUDICIAL_UPDATE.test(text);

  if (NOISE.test(text) && !STRONG_AGENCY_ACTION.test(text)) return { keep: false, reason: "ice_lexical_noise_filtered" };
  if (!agency && !native) return { keep: false, reason: "missing_ice_agency_context" };

  if (ANTI_ICE_PROTEST.test(text) && !/\bice\b.{0,80}(arrest|detain|raid|deport|agent|officer)|(?:arrest|detain|raid|deport).{0,80}\bice\b/i.test(text)) {
    return { keep: false, reason: "anti_ice_protest_without_enforcement_event" };
  }

  if (HYPOTHETICAL_OR_OPINION.test(text) && !FRESH_UPDATE.test(text) && !judicial) return { keep: false, reason: "ice_opinion_without_new_event" };
  if (!concrete && !judicial) return { keep: false, reason: "ice_low_news_value_filtered" };

  if (staleRecap(text) && !FRESH_UPDATE.test(text) && !judicial) return { keep: false, reason: "ice_stale_recap_filtered" };

  return { keep: true, reason: native ? "native_or_official_current_event" : "current_ice_news_event" };
}

function chunks(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}
async function reject(rowsByReason) {
  for (const [reason, rows] of rowsByReason.entries()) {
    for (const group of chunks(rows, 100)) {
      await sb("ice_posts", {
        method: "PATCH",
        query: { id: `in.(${group.map((row) => `\"${row.id}\"`).join(",")})` },
        body: { relevant: false, processing_status: "irrelevant", last_error: reason },
        prefer: "return=minimal"
      });
    }
  }
}

async function main() {
  requireEnv();
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3600000).toISOString();
  const rows = await sb("ice_posts", {
    query: {
      select: "id,source_username,source_type,source_text,processing_status,relevant,source_created_at,created_at",
      created_at: `gte.${cutoff}`,
      order: "created_at.desc",
      limit: String(MAX_ROWS)
    }
  });
  const active = (Array.isArray(rows) ? rows : []).filter((row) => row.relevant !== false && !["published","irrelevant","duplicate","clustered"].includes(String(row.processing_status || "")));
  const rejected = new Map();
  let kept = 0;
  for (const row of active) {
    const result = classifyNewsQuality(row);
    if (result.keep) kept += 1;
    else {
      if (!rejected.has(result.reason)) rejected.set(result.reason, []);
      rejected.get(result.reason).push(row);
    }
  }
  await reject(rejected);
  console.log(JSON.stringify({
    stage: "ice-news-quality-gate-v2",
    scanned: active.length,
    kept,
    rejected: active.length - kept,
    reasons: Object.fromEntries([...rejected.entries()].map(([reason, rows]) => [reason, rows.length]))
  }, null, 2));
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main().catch((error) => {
    console.error("ICE新闻质量门禁失败：", error);
    process.exitCode = 1;
  });
}
