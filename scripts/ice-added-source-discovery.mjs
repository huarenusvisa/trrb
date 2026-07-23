#!/usr/bin/env node
import process from "node:process";

const X_API = "https://api.x.com/2";
const REQUIRED = ["X_BEARER_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const LOOKBACK_HOURS = Number(process.env.ICE_ADDED_SOURCE_LOOKBACK_HOURS || 12);
const MAX_PAGES = Math.max(1, Math.min(3, Number(process.env.ICE_ADDED_SOURCE_MAX_PAGES || 2)));

const SOURCES = [
  { username: "kigfddbh", name: "MORUI" },
  { username: "TheJFreakinC", name: "Jesus Freakin Congress" },
  { username: "Timcast", name: "Tim Pool" }
];

const ICE_RELEVANCE = /\bice\b|immigration and customs enforcement|\bhsi\b|\bero\b|\bdhs\b|\bcbp\b|border patrol|deport|removal|removed|detain|detention|custody|immigration arrest|immigration raid|immigration enforcement|ice agent|ice officer|ice facility|ice detention/i;

function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少 GitHub Secret：${missing.join(", ")}`);
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

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await readJson(response);
  if (!response.ok) {
    const error = new Error(`${options.method || "GET"} ${url} → ${response.status}: ${body?.detail || body?.title || body?.message || body?.raw || "未知错误"}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return request(url, {
    method,
    headers: headers(prefer),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function startTime() {
  return new Date(Date.now() - LOOKBACK_HOURS * 3600000).toISOString();
}

function mediaFromIncludes(tweet, includes) {
  const map = new Map((includes?.media || []).map((item) => [item.media_key, item]));
  return (tweet?.attachments?.media_keys || []).map((key) => map.get(key)).filter(Boolean).map((item) => ({
    type: item.type || "",
    url: item.url || "",
    preview_image_url: item.preview_image_url || "",
    width: item.width || null,
    height: item.height || null,
    duration_ms: item.duration_ms || null,
    variants: Array.isArray(item.variants) ? item.variants : []
  }));
}

async function resolveUser(username) {
  const url = new URL(`${X_API}/users/by/username/${encodeURIComponent(username)}`);
  url.searchParams.set("user.fields", "id,name,username,verified,public_metrics");
  const payload = await request(url, { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } });
  return payload?.data || null;
}

async function timeline(user) {
  const pages = [];
  let pagination = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${X_API}/users/${encodeURIComponent(user.id)}/tweets`);
    url.searchParams.set("max_results", "100");
    url.searchParams.set("start_time", startTime());
    url.searchParams.set("exclude", "retweets,replies");
    if (pagination) url.searchParams.set("pagination_token", pagination);
    url.searchParams.set("tweet.fields", "id,text,author_id,created_at,lang,public_metrics,possibly_sensitive,attachments");
    url.searchParams.set("expansions", "attachments.media_keys");
    url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height,duration_ms,variants");
    const payload = await request(url, { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } });
    pages.push(payload);
    pagination = payload?.meta?.next_token || "";
    if (!pagination) break;
  }
  return pages;
}

async function existingIds(ids) {
  if (!ids.length) return new Set();
  const rows = await sb("ice_posts", {
    query: {
      select: "x_post_id",
      x_post_id: `in.(${ids.map((id) => `\"${id}\"`).join(",")})`,
      limit: "1000"
    }
  });
  return new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.x_post_id)));
}

function makeRow(tweet, user, media) {
  const username = String(user.username || "");
  return {
    x_post_id: String(tweet.id),
    x_url: `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(tweet.id)}`,
    source_registry_id: null,
    source_username: username,
    source_display_name: user.name || username,
    source_type: "monitored_individual",
    trust_tier: 3,
    independence_key: `monitored:${username.toLowerCase()}`,
    source_created_at: tweet.created_at || null,
    source_text: tweet.text || "",
    media,
    raw_payload: {
      tweet,
      author: user,
      discovery: {
        collector: "ice-added-source-discovery-v1",
        lookback_hours: LOOKBACK_HOURS,
        manual_review_only: false,
        auto_editorial_allowed: true,
        attribution_required: true
      }
    },
    relevant: null,
    event_fingerprint: null,
    event_type: null,
    event_date: null,
    city: null,
    state_code: null,
    location_text: null,
    people_count: null,
    claims: [],
    entities: [],
    extraction_confidence: null,
    extraction_payload: {},
    processing_status: "collected",
    attempts: 0,
    last_error: null
  };
}

async function main() {
  requireEnv();
  const collected = new Map();
  const stats = { configured: SOURCES.length, queried: 0, returned: 0, relevant: 0, inserted: 0, failed: [] };

  for (const source of SOURCES) {
    try {
      const user = await resolveUser(source.username);
      if (!user) throw new Error("账号不存在或无法解析");
      const pages = await timeline(user);
      stats.queried += 1;
      for (const payload of pages) {
        for (const tweet of payload?.data || []) {
          stats.returned += 1;
          if (!ICE_RELEVANCE.test(String(tweet.text || ""))) continue;
          stats.relevant += 1;
          collected.set(String(tweet.id), makeRow(tweet, user, mediaFromIncludes(tweet, payload?.includes)));
        }
      }
    } catch (error) {
      stats.failed.push({ username: source.username, status: error.status || null, error: String(error.message || error).slice(0, 240) });
      console.error(`新增ICE信源采集失败：@${source.username} — ${error.message}`);
    }
  }

  const rows = [...collected.values()];
  const exists = await existingIds(rows.map((row) => row.x_post_id));
  const fresh = rows.filter((row) => !exists.has(row.x_post_id));
  if (fresh.length) {
    await sb("ice_posts", {
      method: "POST",
      query: { on_conflict: "x_post_id" },
      body: fresh,
      prefer: "resolution=ignore-duplicates,return=minimal"
    });
  }
  stats.inserted = fresh.length;
  console.log(JSON.stringify({ collector: "ice-added-source-discovery-v1", lookback_hours: LOOKBACK_HOURS, sources: SOURCES.map((x) => x.username), ...stats }, null, 2));
}

main().catch((error) => {
  console.error("新增ICE信源采集失败：", error);
  process.exitCode = 1;
});
