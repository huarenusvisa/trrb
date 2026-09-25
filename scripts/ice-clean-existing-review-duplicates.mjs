#!/usr/bin/env node
import { readDatabaseQuery } from "./paged-read.mjs";
async function sb(table, options = {}) {
  const { method = "GET", query = {} } = options;
  return method === "GET"
    ? readDatabaseQuery(query, pageQuery => sbOnce(table, { ...options, query: pageQuery }))
    : sbOnce(table, options);
}
import process from "node:process";
import {reviewedStoryReady} from "./news-editorial-policy.mjs";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const MAX_AGE_MINUTES = Number(process.env.ICE_MAX_SOURCE_AGE_MINUTES || 60);
const PUBLISHED_DAYS = Number(process.env.ICE_PUBLISHED_DEDUPE_DAYS || 730);
const THRESHOLD = Number(process.env.ICE_REVIEW_DUPLICATE_THRESHOLD || 0.42);
const OFFICIAL_TYPES = /^(official|government|agency)$/i;
const OFFICIAL_HANDLES = /^(icegov|dhsgov|hsi_hq|cbp|usbpchief|uscis|dojcrimdiv|usmarshalshq|fbi|ero[a-z0-9_]*|ice[a-z0-9_]*|dhs[a-z0-9_]*|cbp[a-z0-9_]*|usbp[a-z0-9_]*|uscis[a-z0-9_]*)$/i;

function text(value) { return String(value ?? "").replace(/\u0000/g, "").trim(); }
function normalize(value) {
  return text(value).toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/@[a-z0-9_]+/gi, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
}
const STOP = new Set(["ice","immigration","customs","enforcement","news","report","breaking","update","美国","移民","海关","执法","报道","消息","事件","一名","一位","关注"]);
function tokens(value) {
  const raw = normalize(value).match(/[a-z0-9][a-z0-9'-]{2,}|[\u3400-\u9fff]{2,4}/g) || [];
  return new Set(raw.filter((item) => !STOP.has(item)));
}
function overlap(a, b) {
  const left = tokens(a), right = tokens(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const item of left) if (right.has(item)) common += 1;
  return common / Math.min(left.size, right.size);
}
function grams(value, size = 2) {
  const cleaned = normalize(value)
    .replace(/\b(?:ice|dhs|ero|hsi)\b/g, " ")
    .replace(/美国|移民及海关执法局|移民执法|新闻|报道|消息|最新|事件/g, "")
    .replace(/\s+/g, "");
  const out = new Set();
  for (let index = 0; index <= cleaned.length - size; index += 1) out.add(cleaned.slice(index, index + size));
  return out;
}
function gramOverlap(a, b) {
  const left = grams(a), right = grams(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const item of left) if (right.has(item)) common += 1;
  return common / Math.min(left.size, right.size);
}
function similar(a, b) {
  const left = normalize(a), right = normalize(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length, right.length) >= 28 && (left.includes(right) || right.includes(left))) return true;
  return overlap(left, right) >= THRESHOLD || gramOverlap(left, right) >= 0.34;
}
function combined(row) { return [row.title, row.summary, row.content].filter(Boolean).join(" "); }
function payload(row) { return row?.ai_payload && typeof row.ai_payload === "object" ? row.ai_payload : {}; }
function fingerprint(row) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return text(row?.event_fingerprint || metadata.event_fingerprint);
}
function sameEvent(a, b) {
  const left = fingerprint(a), right = fingerprint(b);
  return Boolean(left && right && left === right)
    || similar(combined(a), combined(b))
    || gramOverlap(a.title, b.title) >= 0.38
    || gramOverlap(`${a.title || ""} ${a.summary || ""}`, `${b.title || ""} ${b.summary || ""}`) >= 0.42;
}
function priority(story) {
  const status = { approved: 500, pending_review: 400, pending_corroboration: 300, collecting: 200 }[story.status] || 0;
  return status + Number(story.official_source_count || 0) * 20 + Number(story.independent_source_count || 0) * 5 + Number(Boolean(story.cover_image));
}
function headers(prefer = "") {
  return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}
async function json(response) { const body = await response.text(); if (!body) return null; try { return JSON.parse(body); } catch { return { raw: body }; } }
async function request(url, options = {}) {
  const response = await fetch(url, options); const body = await json(response);
  if (!response.ok) throw new Error(body?.message || body?.details || body?.raw || `请求失败（${response.status}）`);
  return body;
}
async function sbOnce(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  return request(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
}
async function removeStory(story) {
  await sb("ice_stories", { method: "DELETE", query: { id: `eq.${story.id}` }, prefer: "return=minimal" });
}
function isTierOneOfficial(post) {
  const type = text(post?.source_type);
  const username = text(post?.source_username).replace(/^@/, "");
  return Number(post?.trust_tier) === 1 && (OFFICIAL_TYPES.test(type) || OFFICIAL_HANDLES.test(username));
}
async function hasTierOneOfficialEvidence(story) {
  const links = await sb("ice_story_evidence", { query: { select: "post_id", story_id: `eq.${story.id}`, limit: "100" } });
  const ids = (Array.isArray(links) ? links : []).map((row) => row.post_id).filter(Boolean);
  const linked = ids.length ? await sb("ice_posts", { query: { select: "id,source_type,source_username,trust_tier", id: `in.(${ids.join(",")})`, limit: "100" } }) : [];
  const fingerprintPosts = story.event_fingerprint ? await sb("ice_posts", { query: { select: "id,source_type,source_username,trust_tier", event_fingerprint: `eq.${story.event_fingerprint}`, limit: "100" } }) : [];
  return [...(Array.isArray(linked) ? linked : []), ...(Array.isArray(fingerprintPosts) ? fingerprintPosts : [])].some(isTierOneOfficial);
}
async function resetAutomaticOldNewsConfirmation(story) {
  const current = payload(story);
  if (current.old_news_checked !== true || current.manual_old_news_confirmation === true) return false;
  // Tier-1 government sources use the editorial model's source-grounded date check.
  // Preserve that completed check so the later cleanup stage cannot undo direct publishing.
  if (current.automatic_old_news_check_passed === true && await hasTierOneOfficialEvidence(story)) return false;
  await sb("ice_stories", {
    method: "PATCH", query: { id: `eq.${story.id}` },
    body: { ai_payload: { ...current, old_news_checked: false, automatic_old_news_check_passed: false, manual_old_news_confirmation: false }, updated_at: new Date().toISOString() },
    prefer: "return=minimal"
  });
  story.ai_payload = { ...current, old_news_checked: false, automatic_old_news_check_passed: false, manual_old_news_confirmation: false };
  return true;
}
function isIceArticle(article) {
  return /\b(?:ICE|DHS|ERO|HSI)\b|移民及海关执法局|移民执法|拘留|遣返|递解/u.test(`${article?.title || ""} ${article?.summary || ""} ${article?.category_name || ""} ${article?.topic_key || ""}`);
}
async function loadPublishedArticles(articleCutoff) {
  const output = [];
  for (let offset = 0; offset < 20000; offset += 5000) {
    const page = await sb("articles", { query: {
      select: "id,title,summary,content,published_at,metadata,topic_key,category_name",
      status: "eq.published", published_at: `gte.${articleCutoff}`,
      order: "published_at.desc", limit: "5000", offset: String(offset)
    } });
    const rows = Array.isArray(page) ? page : [];
    output.push(...rows.filter(isIceArticle));
    if (rows.length < 5000) break;
  }
  return output;
}
async function main() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
  const cutoff = new Date(Date.now() - MAX_AGE_MINUTES * 60000).toISOString();
  const articleCutoff = new Date(Date.now() - PUBLISHED_DAYS * 86400000).toISOString();
  const [storiesRaw, articlesRaw] = await Promise.all([
    sb("ice_stories", { query: { select: "id,title,summary,content,cover_image,first_seen_at,last_seen_at,created_at,status,human_review_status,decision_reason,event_fingerprint,official_source_count,independent_source_count,reviewed_by,ai_payload", status: "in.(collecting,pending_review,pending_corroboration,approved)", order: "last_seen_at.desc.nullslast,created_at.desc", limit: "1500" } }),
    loadPublishedArticles(articleCutoff)
  ]);
  const stories = (Array.isArray(storiesRaw) ? storiesRaw : []).sort((a, b) => priority(b) - priority(a));
  const articles = Array.isArray(articlesRaw) ? articlesRaw : [];
  const kept = [];
  let stale = 0, oldNews = 0, resetAutomaticChecks = 0, publishedDuplicate = 0, queueDuplicate = 0, retained = 0;
  for (const story of stories) {
    if (["editing","approved","rejected"].includes(story.human_review_status) || story.reviewed_by || story.ai_payload?.material_update_pending || reviewedStoryReady(story)) {kept.push(story);retained++;continue;}
    if (await resetAutomaticOldNewsConfirmation(story)) resetAutomaticChecks += 1;
    const review = payload(story);
    if (review.appears_old_news === true && review.manual_old_news_confirmation !== true) {
      await removeStory(story);
      oldNews += 1;
      continue;
    }
    const seen = story.last_seen_at || story.first_seen_at || story.created_at || "";
    if (story.status !== "approved" && (!seen || seen < cutoff)) { await removeStory(story); stale += 1; continue; }
    const article = articles.find((item) => sameEvent(story, item));
    if (article) { await removeStory(story); publishedDuplicate += 1; continue; }
    const existing = kept.find((item) => sameEvent(story, item));
    if (existing) { await removeStory(story); queueDuplicate += 1; continue; }
    kept.push(story); retained += 1;
  }
  console.log(JSON.stringify({ stage: "ice-clean-existing-review-duplicates-v3", scanned: stories.length, reset_automatic_old_news_checks: resetAutomaticChecks, removed_old_news: oldNews, removed_stale: stale, removed_published_duplicates: publishedDuplicate, removed_queue_duplicates: queueDuplicate, retained }, null, 2));
}
main().catch((error) => { console.error("ICE现有审核队列去重失败：", error); process.exitCode = 1; });
