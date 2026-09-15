#!/usr/bin/env node
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const MAX_AGE_MINUTES = Number(process.env.ICE_MAX_SOURCE_AGE_MINUTES || 60);
const PUBLISHED_DAYS = Number(process.env.ICE_PUBLISHED_DEDUPE_DAYS || 30);
const THRESHOLD = Number(process.env.ICE_REVIEW_DUPLICATE_THRESHOLD || 0.42);

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
function similar(a, b) {
  const left = normalize(a), right = normalize(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length, right.length) >= 28 && (left.includes(right) || right.includes(left))) return true;
  return overlap(left, right) >= THRESHOLD;
}
function combined(row) { return [row.title, row.summary, row.content].filter(Boolean).join(" "); }
function payload(row) { return row?.ai_payload && typeof row.ai_payload === "object" ? row.ai_payload : {}; }
function fingerprint(row) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return text(row?.event_fingerprint || metadata.event_fingerprint);
}
function sameEvent(a, b) {
  const left = fingerprint(a), right = fingerprint(b);
  return Boolean(left && right && left === right) || similar(combined(a), combined(b));
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
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  return request(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
}
async function reject(story, reason, duplicateId = null) {
  await sb("ice_stories", {
    method: "PATCH", query: { id: `eq.${story.id}` },
    body: {
      status: "rejected", human_review_status: "rejected", reviewed_at: new Date().toISOString(), reviewer_email: "system-dedupe@trrb.net",
      decision_reason: `${story.decision_reason || ""}；${reason}${duplicateId ? `：${duplicateId}` : ""}`, updated_at: new Date().toISOString()
    }, prefer: "return=minimal"
  });
}
async function resetAutomaticOldNewsConfirmation(story) {
  const current = payload(story);
  if (current.old_news_checked !== true || current.manual_old_news_confirmation === true) return false;
  await sb("ice_stories", {
    method: "PATCH", query: { id: `eq.${story.id}` },
    body: { ai_payload: { ...current, old_news_checked: false, manual_old_news_confirmation: false }, updated_at: new Date().toISOString() },
    prefer: "return=minimal"
  });
  story.ai_payload = { ...current, old_news_checked: false, manual_old_news_confirmation: false };
  return true;
}
async function main() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
  const cutoff = new Date(Date.now() - MAX_AGE_MINUTES * 60000).toISOString();
  const articleCutoff = new Date(Date.now() - PUBLISHED_DAYS * 86400000).toISOString();
  const [storiesRaw, articlesRaw] = await Promise.all([
    sb("ice_stories", { query: { select: "id,title,summary,content,cover_image,first_seen_at,last_seen_at,created_at,status,human_review_status,decision_reason,event_fingerprint,official_source_count,independent_source_count,ai_payload", status: "in.(collecting,pending_review,pending_corroboration,approved)", order: "last_seen_at.desc.nullslast,created_at.desc", limit: "1500" } }),
    sb("articles", { query: { select: "id,title,summary,content,published_at,metadata", topic_key: "eq.ice", status: "eq.published", published_at: `gte.${articleCutoff}`, order: "published_at.desc", limit: "5000" } })
  ]);
  const stories = (Array.isArray(storiesRaw) ? storiesRaw : []).sort((a, b) => priority(b) - priority(a));
  const articles = Array.isArray(articlesRaw) ? articlesRaw : [];
  const kept = [];
  let stale = 0, oldNews = 0, resetAutomaticChecks = 0, publishedDuplicate = 0, queueDuplicate = 0, retained = 0;
  for (const story of stories) {
    if (await resetAutomaticOldNewsConfirmation(story)) resetAutomaticChecks += 1;
    const review = payload(story);
    if (review.appears_old_news === true && review.manual_old_news_confirmation !== true) {
      await reject(story, `系统已识别为旧闻：${text(review.old_news_reason) || "来源包含旧事件日期或回顾信息"}`);
      oldNews += 1;
      continue;
    }
    const seen = story.last_seen_at || story.first_seen_at || story.created_at || "";
    if (story.status !== "approved" && (!seen || seen < cutoff)) { await reject(story, "超过时限未形成可发布的新信息，自动移出审核队列"); stale += 1; continue; }
    const article = articles.find((item) => sameEvent(story, item));
    if (article) { await reject(story, "与数据库已发布文章高度相似且无独立新增事实", article.id); publishedDuplicate += 1; continue; }
    const existing = kept.find((item) => sameEvent(story, item));
    if (existing) { await reject(story, "与审核队列中的较新候选高度相似", existing.id); queueDuplicate += 1; continue; }
    kept.push(story); retained += 1;
  }
  console.log(JSON.stringify({ stage: "ice-clean-existing-review-duplicates-v3", scanned: stories.length, reset_automatic_old_news_checks: resetAutomaticChecks, removed_old_news: oldNews, removed_stale: stale, removed_published_duplicates: publishedDuplicate, removed_queue_duplicates: queueDuplicate, retained }, null, 2));
}
main().catch((error) => { console.error("ICE现有审核队列去重失败：", error); process.exitCode = 1; });
