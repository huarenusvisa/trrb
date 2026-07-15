#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";
import { eventProfile, eventFingerprint, sameEvent, removeRepeatedSegments } from "./ice-v2-event-core.mjs";

const MAX = Number(process.env.ICE_V2_CLUSTER_MAX || 300);
const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const now = () => new Date().toISOString();
const jsonValue = (value, fallback = {}) => {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value || "")); } catch { return fallback; }
};

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
  const url = new URL(`${process.env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await readJson(response);
  if (!response.ok) throw new Error(result?.message || result?.details || result?.error || result?.raw || `${response.status}`);
  return result;
}
function isV2(post) { return jsonValue(post.raw_payload, {})?.collector === "ice-v2"; }
function titleOf(text, max = 110) {
  const first = removeRepeatedSegments(text).split(/(?<=[.!?。！？])\s*/)[0] || "ICE候选新闻待审核";
  return Array.from(first).slice(0, max).join("");
}
function summaryOf(text, max = 320) { return Array.from(removeRepeatedSegments(text)).slice(0, max).join(""); }
function imageOf(post) {
  for (const item of Array.isArray(post.media) ? post.media : []) {
    if (item?.type === "photo" && item.url) return item.url;
    if (item?.preview_image_url) return item.preview_image_url;
    if (item?.url) return item.url;
  }
  return "";
}
function storyProfile(story) {
  const payload = jsonValue(story.ai_payload, {});
  return payload.v2_event_profile || eventProfile({
    source_created_at: story.first_seen_at || story.last_seen_at,
    source_text: [story.title, story.summary, story.content].filter(Boolean).join(" "),
    event_type: story.event_type
  });
}
export function findMatch(stories, profile) {
  return stories.find((story) => sameEvent(storyProfile(story), profile));
}
async function posts() {
  const rows = await sb("ice_posts", { query: { select: "*", processing_status: "eq.collected", order: "source_created_at.asc.nullslast", limit: String(MAX) } });
  return (Array.isArray(rows) ? rows : []).filter(isV2);
}
async function stories() {
  const since = new Date(Date.now() - 3 * 86400000).toISOString();
  const rows = await sb("ice_stories", { query: { select: "*", last_seen_at: `gte.${since}`, status: "in.(collecting,pending_corroboration,pending_review,approved,published)", order: "last_seen_at.desc", limit: "500" } });
  return Array.isArray(rows) ? rows : [];
}
async function createStory(post, profile) {
  const time = now();
  const fingerprint = `v2-${eventFingerprint(profile)}`;
  const content = removeRepeatedSegments(post.source_text || "");
  const rows = await sb("ice_stories", {
    method: "POST",
    query: { on_conflict: "event_fingerprint" },
    body: {
      event_fingerprint: fingerprint,
      event_type: profile.action || "other",
      title: titleOf(content), summary: summaryOf(content), content,
      cover_image: imageOf(post),
      first_seen_at: post.source_created_at || time,
      last_seen_at: post.source_created_at || time,
      independent_source_count: 1,
      official_source_count: post.source_type === "official" ? 1 : 0,
      media_source_count: post.source_type === "major_media" ? 1 : 0,
      organization_source_count: 0, individual_source_count: 0,
      total_score: 0, ai_confidence: 0,
      conflict_detected: false, legal_risk: false, privacy_risk: false, fabrication_risk: false,
      decision_reason: "ICE v2已完成白名单过滤和事件级归并，等待中文编辑及人工审核。",
      status: "pending_corroboration", human_review_status: "required", scheduled_at: null,
      ai_payload: { v2_event_engine: true, v2_event_profile: profile, translation_pending: true, lead_source_post_id: post.x_post_id || "" },
      created_at: time, updated_at: time
    },
    prefer: "resolution=ignore-duplicates,return=representation"
  });
  if (Array.isArray(rows) && rows[0]) return rows[0];
  const existing = await sb("ice_stories", { query: { select: "*", event_fingerprint: `eq.${fingerprint}`, limit: "1" } });
  if (Array.isArray(existing) && existing[0]) return existing[0];
  throw new Error("无法创建ICE v2事件");
}
async function attach(story, post) {
  await sb("ice_story_evidence", {
    method: "POST",
    query: { on_conflict: "story_id,post_id" },
    body: {
      story_id: story.id, post_id: post.id, source_registry_id: post.source_registry_id || null,
      independence_key: post.independence_key || post.source_username || String(post.id),
      source_type: post.source_type || "official", trust_tier: Number(post.trust_tier || 2),
      x_post_id: post.x_post_id || "", x_url: post.x_url || ""
    },
    prefer: "resolution=ignore-duplicates,return=minimal"
  });
  const evidence = await sb("ice_story_evidence", { query: { select: "independence_key,source_type", story_id: `eq.${story.id}`, limit: "200" } });
  const rows = Array.isArray(evidence) ? evidence : [];
  const independent = new Set(rows.map((item) => item.independence_key).filter(Boolean)).size;
  const official = rows.filter((item) => item.source_type === "official").length;
  const media = rows.filter((item) => item.source_type === "major_media").length;
  await sb("ice_stories", {
    method: "PATCH", query: { id: `eq.${story.id}` },
    body: { independent_source_count: independent, official_source_count: official, media_source_count: media, last_seen_at: [story.last_seen_at, post.source_created_at].filter(Boolean).sort().at(-1) || now(), cover_image: story.cover_image || imageOf(post), updated_at: now() },
    prefer: "return=minimal"
  });
  await sb("ice_posts", { method: "PATCH", query: { id: `eq.${post.id}` }, body: { event_fingerprint: story.event_fingerprint, processing_status: "clustered", last_error: null }, prefer: "return=minimal" });
}
async function main() {
  requireEnv();
  const pending = await posts();
  const recent = await stories();
  let created = 0, merged = 0, failed = 0;
  for (const post of pending) {
    try {
      const profile = eventProfile(post);
      let story = findMatch(recent, profile);
      if (!story) { story = await createStory(post, profile); recent.unshift(story); created += 1; }
      else merged += 1;
      await attach(story, post);
    } catch (error) {
      failed += 1;
      await sb("ice_posts", { method: "PATCH", query: { id: `eq.${post.id}` }, body: { processing_status: "failed", last_error: String(error.message || error).slice(0, 2000) }, prefer: "return=minimal" });
    }
  }
  console.log(JSON.stringify({ stage: "ice-v2-event-cluster", scanned: pending.length, created, merged, failed }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error("ICE v2 event cluster failed:", error); process.exitCode = 1; });
