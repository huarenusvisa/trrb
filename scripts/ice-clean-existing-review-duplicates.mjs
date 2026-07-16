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
async function main() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
  const cutoff = new Date(Date.now() - MAX_AGE_MINUTES * 60000).toISOString();
  const articleCutoff = new Date(Date.now() - PUBLISHED_DAYS * 86400000).toISOString();
  const [storiesRaw, articlesRaw] = await Promise.all([
    sb("ice_stories", { query: { select: "id,title,summary,content,first_seen_at,last_seen_at,created_at,status,decision_reason,event_fingerprint", status: "in.(collecting,pending_review,pending_corroboration,approved)", order: "last_seen_at.desc.nullslast,created_at.desc", limit: "1500" } }),
    sb("articles", { query: { select: "id,title,summary,content,published_at,metadata", topic_key: "eq.ice", status: "eq.published", published_at: `gte.${articleCutoff}`, order: "published_at.desc", limit: "2000" } })
  ]);
  const stories = Array.isArray(storiesRaw) ? storiesRaw : [];
  const articles = Array.isArray(articlesRaw) ? articlesRaw : [];
  const kept = [];
  let stale = 0, publishedDuplicate = 0, queueDuplicate = 0, retained = 0;
  for (const story of stories) {
    const seen = story.last_seen_at || story.first_seen_at || story.created_at || "";
    if (!seen || seen < cutoff) { await reject(story, "超过一小时未形成可发布的新信息，自动移出审核队列"); stale += 1; continue; }
    const body = combined(story);
    const article = articles.find((item) => similar(body, combined(item)));
    if (article) { await reject(story, "与数据库已发布文章高度相似且无独立新增事实", article.id); publishedDuplicate += 1; continue; }
    const existing = kept.find((item) => similar(body, combined(item)));
    if (existing) { await reject(story, "与近一小时审核队列中的较新候选高度相似", existing.id); queueDuplicate += 1; continue; }
    kept.push(story); retained += 1;
  }
  console.log(JSON.stringify({ stage: "ice-clean-existing-review-duplicates-v1", scanned: stories.length, removed_stale_over_one_hour: stale, removed_published_duplicates: publishedDuplicate, removed_queue_duplicates: queueDuplicate, retained }, null, 2));
}
main().catch((error) => { console.error("ICE现有审核队列去重失败：", error); process.exitCode = 1; });
