#!/usr/bin/env node
import process from "node:process";

const BASE = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function requireEnv() {
  if (!BASE || !KEY) throw new Error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
}
function headers(prefer = "") {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}
async function rest(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${BASE}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const response = await fetch(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.details || `Supabase ${response.status}`);
  return data;
}
function normalize(value) {
  return String(value || "").toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[\p{P}\p{S}\s]+/gu, "").replace(/\d{1,2}[:/\-]\d{1,2}(?:[:/\-]\d{1,4})?/g, "");
}
function grams(value, size = 3) {
  const text = normalize(value);
  const set = new Set();
  for (let i = 0; i <= text.length - size; i += 1) set.add(text.slice(i, i + size));
  return set;
}
function similarity(a, b) {
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit += 1;
  return (2 * hit) / (A.size + B.size);
}
function timeOf(row) { const d = new Date(row.source_created_at || row.created_at || row.updated_at || 0); return Number.isNaN(d.getTime()) ? 0 : d.getTime(); }
function preferred(a, b) {
  const rank = (x) => x.status === "published" ? 4 : x.status === "approved" ? 3 : x.status === "pending_review" ? 2 : 1;
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;
  const sourcesA = Number(a.official_source_count || 0) + Number(a.independent_source_count || 0);
  const sourcesB = Number(b.official_source_count || 0) + Number(b.independent_source_count || 0);
  if (sourcesA !== sourcesB) return sourcesA > sourcesB ? a : b;
  return timeOf(a) <= timeOf(b) ? a : b;
}
async function rejectDuplicate(row, keeper, reason) {
  if (["published", "rejected"].includes(row.status)) return false;
  await rest("ice_stories", {
    method: "PATCH",
    query: { id: `eq.${row.id}` },
    body: {
      status: "rejected",
      decision_reason: `自动查重隐藏：${reason}；保留记录 ${keeper.id}`,
      updated_at: new Date().toISOString()
    },
    prefer: "return=minimal"
  });
  return true;
}
async function main() {
  requireEnv();
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows = await rest("ice_stories", { query: { select: "*", created_at: `gte.${since}`, order: "created_at.asc", limit: "1000" } });
  const stories = Array.isArray(rows) ? rows : [];
  const keepers = [];
  let hidden = 0;
  for (const story of stories) {
    let duplicate = null;
    let reason = "";
    for (const prior of keepers) {
      if (story.id === prior.id) continue;
      if (story.event_fingerprint && prior.event_fingerprint && story.event_fingerprint === prior.event_fingerprint) {
        duplicate = prior; reason = "相同事件指纹"; break;
      }
      const a = `${story.title || ""} ${story.summary || ""}`;
      const b = `${prior.title || ""} ${prior.summary || ""}`;
      if (Math.abs(timeOf(story) - timeOf(prior)) <= 72 * 3600000 && similarity(a, b) >= 0.76) {
        duplicate = prior; reason = "标题与摘要高度相似"; break;
      }
    }
    if (!duplicate) { keepers.push(story); continue; }
    const keeper = preferred(story, duplicate);
    const loser = keeper.id === story.id ? duplicate : story;
    if (keeper.id === story.id) {
      const index = keepers.findIndex((x) => x.id === duplicate.id);
      if (index >= 0) keepers[index] = story;
    }
    if (await rejectDuplicate(loser, keeper, reason)) hidden += 1;
  }
  console.log(`ICE查重完成：扫描${stories.length}条，隐藏重复${hidden}条，保留${keepers.length}条。`);
}
main().catch((error) => { console.error("ICE查重失败：", error); process.exitCode = 1; });
