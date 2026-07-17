#!/usr/bin/env node
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const WINDOW_HOURS = Number(process.env.ICE_ENGLISH_DEDUPE_WINDOW_HOURS || 720);
const CANDIDATE_MINUTES = Number(process.env.ICE_ENGLISH_DEDUPE_CANDIDATE_MINUTES || 90);
const MAX_ROWS = Number(process.env.ICE_ENGLISH_DEDUPE_MAX || 2500);
const THRESHOLD = Number(process.env.ICE_ENGLISH_DEDUPE_THRESHOLD || 0.46);

const STOP = new Set([
  "the","a","an","and","or","of","to","in","on","at","for","from","with","by","is","are","was","were","be","been","being",
  "this","that","these","those","it","its","as","into","over","after","before","during","new","breaking","update","video","watch",
  "ice","immigration","customs","enforcement","agent","agents","officer","officers","federal","official","officials","report","reports","news"
]);
const ACTIONS = [
  ["arrest","arrested","apprehend","apprehended","custody","detain","detained","detention"],
  ["raid","operation","sweep","search warrant"],
  ["shoot","shot","shooting","gunfire","killed","fatal","death","dead","died"],
  ["deport","deported","deportation","removal","removed","repatriation"],
  ["chase","crash","vehicle stop","traffic stop"],
  ["protest","vigil","lawsuit","court","judge","attorney","lawyer"]
];

function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}
function safe(value, max = 30000) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function normalize(value) {
  return safe(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/@[a-z0-9_]+/gi, " ")
    .replace(/#([a-z0-9_]+)/gi, "$1")
    .replace(/\b(?:breaking|just in|exclusive|developing|watch|video|update)\b/gi, " ")
    .replace(/[^a-z0-9\s'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokens(value) {
  return new Set((normalize(value).match(/[a-z0-9][a-z0-9'-]{2,}/g) || []).filter((token) => !STOP.has(token)));
}
function ngrams(value, size = 3) {
  const text = normalize(value).replace(/\s+/g, "");
  if (!text) return new Set();
  if (text.length <= size) return new Set([text]);
  const out = new Set();
  for (let i = 0; i <= text.length - size; i += 1) out.add(text.slice(i, i + size));
  return out;
}
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const item of a) if (b.has(item)) common += 1;
  return common / Math.min(a.size, b.size);
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const item of a) if (b.has(item)) common += 1;
  return common / new Set([...a, ...b]).size;
}
function actionKeys(value) {
  const text = normalize(value);
  const out = new Set();
  ACTIONS.forEach((group, index) => { if (group.some((term) => text.includes(term))) out.add(String(index)); });
  return out;
}
function numbers(value) { return new Set(normalize(value).match(/\b\d{1,4}\b/g) || []); }
function properNouns(value) {
  const text = safe(value, 10000);
  return new Set((text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3}\b/g) || []).map(normalize).filter(Boolean));
}
function mediaKeys(row) {
  const out = new Set();
  for (const item of Array.isArray(row?.media) ? row.media : []) {
    for (const value of [item?.url, item?.preview_image_url]) {
      const clean = safe(value, 2000).replace(/[?#].*$/, "");
      if (clean) out.add(clean);
    }
  }
  return out;
}
function similarity(a, b) {
  const aTokens = tokens(a); const bTokens = tokens(b);
  return Math.max(jaccard(aTokens, bTokens), overlap(aTokens, bTokens) * 0.84, jaccard(ngrams(a), ngrams(b)));
}
function sameEvent(a, b) {
  const left = normalize(a?.source_text); const right = normalize(b?.source_text);
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length, right.length) >= 45 && (left.includes(right) || right.includes(left))) return true;
  const aMedia = mediaKeys(a); const bMedia = mediaKeys(b);
  if (aMedia.size && bMedia.size && overlap(aMedia, bMedia) > 0) return true;
  const score = similarity(left, right);
  const action = overlap(actionKeys(left), actionKeys(right));
  const number = overlap(numbers(left), numbers(right));
  const proper = overlap(properNouns(a?.source_text), properNouns(b?.source_text));
  const common = [...tokens(left)].filter((token) => tokens(right).has(token)).length;
  if (action > 0 && proper > 0 && score >= 0.23) return true;
  if (action > 0 && number > 0 && common >= 2 && score >= 0.22) return true;
  if (proper > 0 && number > 0 && common >= 2 && score >= 0.27) return true;
  return common >= 4 && score >= THRESHOLD;
}
function quality(row) {
  const trust = Math.max(1, Math.min(9, Number(row?.trust_tier || 9)));
  const hasMedia = mediaKeys(row).size > 0 ? 1 : 0;
  const verified = /official|verified|media|priority/i.test(String(row?.source_type || "")) ? 1 : 0;
  const length = Math.min(600, normalize(row?.source_text).length);
  return verified * 10000 + (10 - trust) * 1000 + hasMedia * 300 + length;
}
async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
function headers(prefer = "") {
  return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  const response = await fetch(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || payload?.details || payload?.hint || payload?.raw || `Supabase请求失败：${response.status}`);
  return payload;
}
function chunks(values, size) { const out = []; for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size)); return out; }
async function markDuplicates(ids) {
  for (const group of chunks(ids, 100)) {
    await sb("ice_posts", {
      method: "PATCH",
      query: { id: `in.(${group.map((id) => `\"${id}\"`).join(",")})` },
      body: { relevant: false, processing_status: "irrelevant", last_error: "english_pretranslation_duplicate" },
      prefer: "return=minimal"
    });
  }
}
async function main() {
  requireEnv();
  const historyCutoff = new Date(Date.now() - WINDOW_HOURS * 3600000).toISOString();
  const candidateCutoffMs = Date.now() - CANDIDATE_MINUTES * 60000;
  const rows = await sb("ice_posts", {
    query: {
      select: "id,x_post_id,source_text,source_type,trust_tier,source_created_at,created_at,media,processing_status,relevant",
      source_created_at: `gte.${historyCutoff}`,
      order: "source_created_at.desc.nullslast,created_at.desc",
      limit: String(MAX_ROWS)
    }
  });
  const all = Array.isArray(rows)
    ? rows.filter((row) => row.relevant !== false && normalize(row.source_text))
    : [];
  const candidateStatuses = new Set(["collected","processing","failed","extracted"]);
  const candidates = all.filter((row) => {
    const ts = new Date(row.source_created_at || row.created_at || 0).getTime();
    return Number.isFinite(ts) && ts >= candidateCutoffMs && candidateStatuses.has(String(row.processing_status || ""));
  }).sort((a, b) => quality(b) - quality(a));
  const candidateIds = new Set(candidates.map((row) => String(row.id)));
  const references = all.filter((row) => !candidateIds.has(String(row.id)) || !candidateStatuses.has(String(row.processing_status || "")));
  const keepers = [];
  const duplicateIds = [];
  for (const candidate of candidates) {
    const duplicate = [...keepers, ...references].find((row) => row.id !== candidate.id && sameEvent(candidate, row));
    if (duplicate) duplicateIds.push(candidate.id);
    else keepers.push(candidate);
  }
  if (duplicateIds.length) await markDuplicates(duplicateIds);
  console.log(JSON.stringify({ stage: "english-pretranslation-dedupe-v2", scanned: all.length, candidates: candidates.length, kept: keepers.length, filtered_duplicates: duplicateIds.length, history_hours: WINDOW_HOURS, candidate_minutes: CANDIDATE_MINUTES, threshold: THRESHOLD }, null, 2));
}

main().catch((error) => { console.error("英文原文预翻译去重失败：", error); process.exitCode = 1; });