#!/usr/bin/env node
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const OFFICIAL_TYPES = /^(official|government|agency)$/i;
const OFFICIAL_HANDLES = /^(icegov|dhsgov|hsi_hq|cbp|usbpchief|uscis|dojcrimdiv|usmarshalshq|fbi|ero[a-z0-9_]*|ice[a-z0-9_]*|dhs[a-z0-9_]*|cbp[a-z0-9_]*|usbp[a-z0-9_]*|uscis[a-z0-9_]*)$/i;
const MAX_AGE_MINUTES = Number(process.env.ICE_TRUSTED_MAX_AGE_MINUTES || 120);

function nowIso() { return new Date().toISOString(); }
function requireEnv() { const missing = REQUIRED.filter((name) => !process.env[name]); if (missing.length) throw new Error(`缺少 GitHub Secret：${missing.join(", ")}`); }
function headers(prefer = "") { return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }; }
async function readJson(response) { const text = await response.text(); if (!text) return null; try { return JSON.parse(text); } catch { return { raw: text }; } }
async function request(url, options = {}) { const response = await fetch(url, options); const body = await readJson(response); if (!response.ok) throw new Error(body?.message || body?.details || body?.error || body?.raw || `请求失败（${response.status}）`); return body; }
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) { const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`); for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value)); return request(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) }); }
async function evidenceFor(storyId) { const links = await sb("ice_story_evidence", { query: { select: "post_id", story_id: `eq.${storyId}`, limit: "100" } }); const ids = (Array.isArray(links) ? links : []).map((row) => row.post_id).filter(Boolean); if (!ids.length) return []; const rows = await sb("ice_posts", { query: { select: "id,source_type,source_username,source_display_name,trust_tier,source_created_at", id: `in.(${ids.join(",")})`, limit: "100" } }); return Array.isArray(rows) ? rows : []; }
function official(post) { const type = String(post?.source_type || ""); const username = String(post?.source_username || "").replace(/^@/, ""); return OFFICIAL_TYPES.test(type) || OFFICIAL_HANDLES.test(username); }
function recentEnough(story) { const time = new Date(story.last_seen_at || story.first_seen_at || story.created_at || 0).getTime(); return Number.isFinite(time) && Date.now() - time <= MAX_AGE_MINUTES * 60000; }
function hasChinese(value) { return /[\u3400-\u9fff]/.test(String(value || "")); }

async function main() {
  requireEnv();
  const rows = await sb("ice_stories", { query: { select: "*", status: "in.(collecting,pending_review,pending_corroboration)", order: "updated_at.desc", limit: "1000" } });
  let approved = 0, manual = 0, incomplete = 0, stale = 0;
  for (const story of Array.isArray(rows) ? rows : []) {
    if (!recentEnough(story)) { stale += 1; continue; }
    if (!String(story.title || "").trim() || !String(story.content || "").trim() || !hasChinese(story.title) || !hasChinese(story.content)) { incomplete += 1; continue; }
    const evidence = await evidenceFor(story.id);
    const officialEvidence = evidence.filter(official);
    if (!officialEvidence.length) { manual += 1; continue; }
    const payload = story.ai_payload && typeof story.ai_payload === "object" ? story.ai_payload : {};
    const sources = [...new Set(officialEvidence.map((post) => post.source_username).filter(Boolean))];
    await sb("ice_stories", { method: "PATCH", query: { id: `eq.${story.id}` }, body: {
      status: "approved",
      human_review_status: "approved",
      reviewer_email: "ai-official-source@trrb.net",
      reviewed_at: nowIso(),
      scheduled_at: nowIso(),
      total_score: Math.max(100, Number(story.total_score || 0)),
      legal_risk: false,
      conflict_detected: false,
      privacy_risk: false,
      fabrication_risk: false,
      ai_payload: {
        ...payload,
        official_source_auto: true,
        trusted_source_auto: true,
        official_direct_publish: true,
        official_source_types: [...new Set(officialEvidence.map((post) => post.source_type))],
        official_source_accounts: sources,
        official_source_promoted_at: nowIso()
      },
      decision_reason: `${story.decision_reason || ""}；官方机构账号来源，中文编辑完成后直接发布`,
      updated_at: nowIso()
    }, prefer: "return=minimal" });
    approved += 1;
  }
  console.log(JSON.stringify({ stage: "ice-official-source-promote-v3", checked: Array.isArray(rows) ? rows.length : 0, approved, manual_non_official: manual, incomplete_or_not_chinese: incomplete, stale }, null, 2));
}

main().catch((error) => { console.error("ICE官方信源自动批准失败：", error); process.exitCode = 1; });
