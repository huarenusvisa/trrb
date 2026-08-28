#!/usr/bin/env node
import process from "node:process";
import { pathToFileURL } from "node:url";

const X_API = "https://api.x.com/2";
const PIPELINE = "trump-x-v1";
const LOOKBACK_HOURS = Math.max(3, Math.min(24, Number(process.env.TRUMP_X_LOOKBACK_HOURS || 6)));
const MAX_FETCH = Math.max(10, Math.min(100, Number(process.env.TRUMP_X_MAX_FETCH || 100)));
const REQUIRED = ["X_BEARER_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const TRUMP_PATTERN = /\b(?:donald\s+j\.?\s+trump|donald\s+trump|president\s+trump|trump)\b|特朗普|川普/i;

function clean(value, max = 30_000) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function requireEnvironment() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}
function headers(prefer = "") {
  return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}
async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await readJson(response);
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url} → ${response.status}: ${body?.detail || body?.title || body?.message || body?.raw || "未知错误"}`);
  return body;
}
async function supabase(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  return request(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
}

function mediaFrom(tweet, includes) {
  const byKey = new Map((includes?.media || []).map((item) => [item.media_key, item]));
  return (tweet?.attachments?.media_keys || []).map((key) => byKey.get(key)).filter(Boolean).map((item) => ({
    type: item.type || "", url: item.url || "", preview_image_url: item.preview_image_url || "",
    width: item.width || null, height: item.height || null, duration_ms: item.duration_ms || null,
    variants: Array.isArray(item.variants) ? item.variants : []
  }));
}

export function buildCandidate(tweet, author = {}, media = [], collectedAt = new Date().toISOString()) {
  const id = clean(tweet?.id, 100);
  const username = clean(author?.username || "unknown", 100).replace(/^@/, "");
  const text = clean(tweet?.text, 30_000);
  return {
    external_id: `x:trump:${id}`,
    pipeline: PIPELINE,
    source_url: username === "unknown" ? `https://x.com/i/web/status/${id}` : `https://x.com/${encodeURIComponent(username)}/status/${id}`,
    source_account: `@${username}`,
    source_name: clean(author?.name || username, 200),
    source_level: author?.verified ? "verified_social" : "social_monitor",
    raw_text: text,
    raw_payload: {
      tweet_id: id, source_created_at: tweet?.created_at || collectedAt, lang: tweet?.lang || "",
      public_metrics: tweet?.public_metrics || {}, author: { id: author?.id || "", username, name: author?.name || "", verified: Boolean(author?.verified) }, media
    },
    ai_payload: { status: "queued", proposed_title: clean(text.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " "), 120), topic_key: "trump", manual_review_required: true },
    proposed_section: "特朗普专题",
    confidence: 80,
    decision: "pending_review",
    decision_reason: "X平台特朗普相关资讯，已进入采集内容中心等待编辑处理",
    collected_at: collectedAt,
    created_at: collectedAt,
    updated_at: collectedAt
  };
}

async function collect() {
  const url = new URL(`${X_API}/tweets/search/recent`);
  url.searchParams.set("query", '("Donald Trump" OR "President Trump" OR Trump OR 特朗普 OR 川普) -is:retweet');
  url.searchParams.set("max_results", String(MAX_FETCH));
  url.searchParams.set("start_time", new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString());
  url.searchParams.set("sort_order", "recency");
  url.searchParams.set("tweet.fields", "id,text,author_id,created_at,lang,public_metrics,possibly_sensitive,attachments,conversation_id");
  url.searchParams.set("expansions", "author_id,attachments.media_keys");
  url.searchParams.set("user.fields", "id,name,username,verified,public_metrics");
  url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height,duration_ms,variants");
  return request(url, { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } });
}

async function existingExternalIds(ids) {
  if (!ids.length) return new Set();
  const rows = await supabase("news_candidates", { query: {
    select: "external_id", external_id: `in.(${ids.map((id) => `\"x:trump:${id}\"`).join(",")})`, limit: String(ids.length)
  } });
  return new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.external_id)));
}

export async function run() {
  requireEnvironment();
  const payload = await collect();
  const authors = new Map((payload?.includes?.users || []).map((user) => [String(user.id), user]));
  const tweets = (payload?.data || []).filter((tweet) => TRUMP_PATTERN.test(clean(tweet.text)));
  const existing = await existingExternalIds(tweets.map((tweet) => clean(tweet.id, 100)));
  const collectedAt = new Date().toISOString();
  const rows = tweets
    .filter((tweet) => !existing.has(`x:trump:${tweet.id}`))
    .map((tweet) => buildCandidate(tweet, authors.get(String(tweet.author_id)) || {}, mediaFrom(tweet, payload?.includes), collectedAt));
  if (rows.length) await supabase("news_candidates", { method: "POST", body: rows, prefer: "return=minimal" });
  const report = { pipeline: PIPELINE, lookback_hours: LOOKBACK_HOURS, returned: payload?.data?.length || 0, relevant: tweets.length, duplicate: existing.size, inserted: rows.length };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run().catch((error) => { console.error("特朗普X资讯采集失败：", error); process.exitCode = 1; });
