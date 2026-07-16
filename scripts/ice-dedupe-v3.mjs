#!/usr/bin/env node
import process from "node:process";

const BASE = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const WINDOW_HOURS = Number(process.env.ICE_DEDUPE_HOURS || 2);

function requireEnv() { if (!BASE || !KEY) throw new Error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY"); }
function headers(prefer = "") { return { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }; }
async function rest(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${BASE}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const response = await fetch(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.details || `Supabase ${response.status}`);
  return data;
}
function normalize(value) { return String(value || "").toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[\p{P}\p{S}\s]+/gu, "").trim(); }
function tokens(value) {
  const text = String(value || "").toLowerCase().replace(/https?:\/\/\S+/g, " ");
  return new Set((text.match(/[a-z]{3,}|[\u3400-\u9fff]{2,}|\d+/gu) || []).filter((x) => !/^(the|and|with|from|this|that|ice|移民|执法|新闻)$/.test(x)));
}
function overlap(a, b) { const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0; let hit = 0; for (const x of A) if (B.has(x)) hit += 1; return hit / Math.max(1, Math.min(A.size, B.size)); }
function grams(value, size = 3) { const text = normalize(value); const set = new Set(); for (let i = 0; i <= text.length - size; i += 1) set.add(text.slice(i, i + size)); return set; }
function similarity(a, b) { const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0; let hit = 0; for (const x of A) if (B.has(x)) hit += 1; return (2 * hit) / (A.size + B.size); }
function timeOf(row) { const d = new Date(row.last_seen_at || row.first_seen_at || row.created_at || row.updated_at || 0); return Number.isNaN(d.getTime()) ? 0 : d.getTime(); }
function payload(row) { return row?.ai_payload && typeof row.ai_payload === "object" ? row.ai_payload : {}; }
function dimensions(row) {
  const p = payload(row);
  const entities = [...(Array.isArray(p.entities) ? p.entities : []), ...(Array.isArray(p.confirmed_facts) ? p.confirmed_facts : [])].join(" ");
  return {
    time: String(row.first_seen_at || row.last_seen_at || row.created_at || "").slice(0, 13),
    place: normalize(`${p.location_text || ""} ${p.city || ""} ${p.state_code || ""} ${row.title || ""}`),
    people: normalize(`${entities} ${row.title || ""} ${row.summary || ""}`),
    type: normalize(row.event_type || p.event_type || ""),
    facts: `${row.title || ""} ${row.summary || ""} ${row.content || ""} ${entities}`
  };
}
function sameEvent(a, b) {
  if (a.event_fingerprint && b.event_fingerprint && a.event_fingerprint === b.event_fingerprint) return { yes: true, reason: "相同事件指纹" };
  const A = dimensions(a), B = dimensions(b);
  if (Math.abs(timeOf(a) - timeOf(b)) > WINDOW_HOURS * 3600000) return { yes: false };
  const sameType = !A.type || !B.type || A.type === B.type;
  const placeScore = overlap(A.place, B.place);
  const peopleScore = overlap(A.people, B.people);
  const factScore = Math.max(similarity(A.facts, B.facts), overlap(A.facts, B.facts));
  if (sameType && factScore >= 0.78) return { yes: true, reason: "事件事实高度相似" };
  if (sameType && placeScore >= 0.5 && peopleScore >= 0.45 && factScore >= 0.5) return { yes: true, reason: "时间地点人物及事件信息重复" };
  if (sameType && placeScore >= 0.7 && factScore >= 0.62) return { yes: true, reason: "同一地点同类事件重复" };
  return { yes: false };
}
function preferred(a, b) {
  const rank = (x) => x.status === "published" ? 5 : x.status === "approved" ? 4 : x.status === "pending_review" ? 3 : x.status === "pending_corroboration" ? 2 : 1;
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;
  const sourcesA = Number(a.official_source_count || 0) * 3 + Number(a.media_source_count || 0) * 2 + Number(a.independent_source_count || 0);
  const sourcesB = Number(b.official_source_count || 0) * 3 + Number(b.media_source_count || 0) * 2 + Number(b.independent_source_count || 0);
  if (sourcesA !== sourcesB) return sourcesA > sourcesB ? a : b;
  return timeOf(a) >= timeOf(b) ? a : b;
}
async function rejectDuplicate(row, keeper, reason) {
  if (["published", "rejected"].includes(row.status)) return false;
  await rest("ice_stories", { method: "PATCH", query: { id: `eq.${row.id}` }, body: { status: "rejected", decision_reason: `自动查重隐藏：${reason}；保留记录 ${keeper.id}`, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
  return true;
}
async function main() {
  requireEnv();
  const since = new Date(Date.now() - Math.max(2, WINDOW_HOURS) * 3600000).toISOString();
  const rows = await rest("ice_stories", { query: { select: "*", created_at: `gte.${since}`, order: "created_at.asc", limit: "1500" } });
  const stories = Array.isArray(rows) ? rows : [];
  const keepers = [];
  let hidden = 0;
  for (const story of stories) {
    let duplicate = null, reason = "";
    for (const prior of keepers) {
      const match = sameEvent(story, prior);
      if (match.yes) { duplicate = prior; reason = match.reason; break; }
    }
    if (!duplicate) { keepers.push(story); continue; }
    const keeper = preferred(story, duplicate);
    const loser = keeper.id === story.id ? duplicate : story;
    if (keeper.id === story.id) { const index = keepers.findIndex((x) => x.id === duplicate.id); if (index >= 0) keepers[index] = story; }
    if (await rejectDuplicate(loser, keeper, reason)) hidden += 1;
  }
  console.log(`ICE多维查重完成：扫描${stories.length}条，隐藏重复${hidden}条，保留${keepers.length}条。`);
}
main().catch((error) => { console.error("ICE多维查重失败：", error); process.exitCode = 1; });