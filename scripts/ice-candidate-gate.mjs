#!/usr/bin/env node
import process from "node:process";
import iceClassifier from "../netlify/functions/_shared/ice-enforcement.js";

const { isIceEnforcementEvidence } = iceClassifier;
const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const MAX_ROWS = Number(process.env.ICE_CANDIDATE_GATE_MAX || process.env.ICE_OFFICIAL_FILTER_MAX || 4000);
const LOOKBACK_HOURS = Number(process.env.ICE_CANDIDATE_GATE_LOOKBACK_HOURS || 12);
const HIGH_RECALL_MIN_SCORE = Number(process.env.ICE_HIGH_RECALL_MIN_SCORE || 45);

const NATIVE_AGENCY_HANDLE = /^(icegov|dhsgov|hsi_hq|cbp|usbpchief|uscis|doj_eoir|ero[a-z0-9_]*|ice[a-z0-9_]*|dhs[a-z0-9_]*|cbp[a-z0-9_]*|usbp[a-z0-9_]*|uscis[a-z0-9_]*|hsi[a-z0-9_]*)$/i;
const CANDIDATE_SOURCE_TYPE = /^(official|government|agency|monitored_individual|verified_discovered|discovered_individual|major_media|local_media|specialist_media|media|legal_org|research_org|civic_org|organization|individual)$/i;
const DIRECT_CONTEXT = /\bice\b|immigration and customs enforcement|enforcement and removal operations|\bero\b|\bhsi\b|homeland security investigations|\bdhs\b|department of homeland security|\bcbp\b|customs and border protection|border patrol|\busbp\b|\buscis\b|immigration agents?|immigration officers?|federal immigration agents?|deportation officers?|移民与海关执法局|移民和海关执法局|移民局特工|移民执法人员|国土安全调查局|边境巡逻/i;
const ACTION_CONTEXT = /arrest|apprehend|detain|detention|custody|raid|operation|sweep|deport|removal|repatriat|warrant|fugitive|shoot|shot|gunfire|use of force|chase|crash|vehicle stop|traffic stop|worksite|courthouse|facility|traffick|smuggl|rescued|recovered|fraud|抓捕|抓获|拘捕|逮捕|拘留|拘押|羁押|带走|抓走|遣返|递解|驱逐|突袭|搜捕|扫荡|执法行动|查获|枪击|开枪|追车|破窗|拖出|营救|人口贩卖|走私/i;
const IMMIGRATION_CONTEXT = /immigration|immigrant|migrant|undocumented|illegal alien|illegal immigrant|deport|removal|asylum|border|visa|green card|移民|非法入境|无证|庇护|边境|遣返|递解|驱逐/i;
const FEDERAL_AGENT_CONTEXT = /federal agents?|federal officers?|dhs agents?|homeland security agents?/i;

function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}
function headers(prefer = "") {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}
async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: headers(prefer),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || payload?.details || payload?.hint || payload?.raw || `Supabase请求失败：${response.status}`);
  return payload;
}
function safePayload(value) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value || "")); } catch { return {}; }
}
function highRecallSignal(row) {
  const payload = safePayload(row?.raw_payload);
  const discovery = payload?.discovery || payload?.tweet?.discovery || {};
  const collector = String(discovery?.collector || "");
  const score = Number(discovery?.relevance_score || 0);
  return collector.startsWith("ice-high-recall-") && score >= HIGH_RECALL_MIN_SCORE;
}
function isCandidate(row) {
  const text = String(row?.source_text || "");
  const username = String(row?.source_username || "").replace(/^@/, "").trim();
  const sourceType = String(row?.source_type || "").trim();

  // Strict original evidence always qualifies for intake.
  if (isIceEnforcementEvidence(text, username)) return true;

  // High-recall discovery already applied a source/relevance score. Keep it for AI + human review;
  // do not confuse "not safe to auto-publish" with "not worth collecting".
  if (highRecallSignal(row)) return true;

  if (!CANDIDATE_SOURCE_TYPE.test(sourceType) && !NATIVE_AGENCY_HANDLE.test(username)) return false;
  if (!ACTION_CONTEXT.test(text)) return false;

  // Broad candidate coverage: explicit ICE/ERO/HSI/DHS/CBP/USCIS context, or federal-agent
  // wording paired with immigration context. Final publication remains stricter downstream.
  if (DIRECT_CONTEXT.test(text)) return true;
  if (FEDERAL_AGENT_CONTEXT.test(text) && IMMIGRATION_CONTEXT.test(text)) return true;
  if (NATIVE_AGENCY_HANDLE.test(username) && (IMMIGRATION_CONTEXT.test(text) || ACTION_CONTEXT.test(text))) return true;
  return false;
}
function chunks(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}
async function reject(rows) {
  for (const group of chunks(rows, 100)) {
    await sb("ice_posts", {
      method: "PATCH",
      query: { id: `in.(${group.map((row) => `\"${row.id}\"`).join(",")})` },
      body: {
        relevant: false,
        processing_status: "irrelevant",
        last_error: "non_ice_candidate_filtered"
      },
      prefer: "return=minimal"
    });
  }
}
async function main() {
  requireEnv();
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3600000).toISOString();
  const rows = await sb("ice_posts", {
    query: {
      select: "id,source_username,source_display_name,source_type,source_text,raw_payload,processing_status,relevant,source_created_at,created_at",
      created_at: `gte.${cutoff}`,
      order: "created_at.desc",
      limit: String(MAX_ROWS)
    }
  });

  const active = (Array.isArray(rows) ? rows : []).filter((row) =>
    row.relevant !== false && !["published", "irrelevant", "duplicate", "clustered"].includes(String(row.processing_status || ""))
  );
  const rejected = active.filter((row) => !isCandidate(row));
  if (rejected.length) await reject(rejected);

  console.log(JSON.stringify({
    stage: "broad-ice-candidate-gate-v1",
    scanned: active.length,
    kept_for_ai_or_review: active.length - rejected.length,
    rejected_clearly_unrelated: rejected.length,
    high_recall_min_score: HIGH_RECALL_MIN_SCORE
  }, null, 2));
}

main().catch((error) => {
  console.error("ICE候选内容过滤失败：", error);
  process.exitCode = 1;
});
