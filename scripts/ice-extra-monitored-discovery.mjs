#!/usr/bin/env node
import process from "node:process";

const X_API = "https://api.x.com/2";
const HANDLES = ["WallStreetApes", "EricLeeAtty"];
const LOOKBACK_MINUTES = Math.min(720, Math.max(30, Number(process.env.ICE_EXTRA_LOOKBACK_MINUTES || process.env.ICE_PRIORITY_LOOKBACK_MINUTES || 180)));
const REQUIRED = ["X_BEARER_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
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
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url} → ${response.status}: ${body?.detail || body?.title || body?.message || body?.raw || "未知错误"}`);
  return body;
}
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  return request(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
}
function relevant(text) {
  return /\bice\b|immigration and customs enforcement|\bhsi\b|deport|removal|detain|custody|arrest|raid|enforcement|immigration/i.test(String(text || ""));
}
function media(tweet, includes) {
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
  return (await request(url, { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } }))?.data || null;
}
async function timeline(user, startTime) {
  const url = new URL(`${X_API}/users/${encodeURIComponent(user.id)}/tweets`);
  url.searchParams.set("max_results", "100");
  url.searchParams.set("start_time", startTime);
  url.searchParams.set("exclude", "retweets,replies");
  url.searchParams.set("tweet.fields", "id,text,author_id,created_at,lang,public_metrics,possibly_sensitive,attachments");
  url.searchParams.set("expansions", "attachments.media_keys");
  url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height,duration_ms,variants");
  return request(url, { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } });
}
function row(tweet, user, attachedMedia) {
  return {
    x_post_id: String(tweet.id),
    x_url: `https://x.com/${encodeURIComponent(user.username)}/status/${encodeURIComponent(tweet.id)}`,
    source_registry_id: null,
    source_username: user.username,
    source_display_name: user.name || user.username,
    source_type: "monitored_individual",
    trust_tier: 4,
    independence_key: `monitored:${String(user.username).toLowerCase()}`,
    source_created_at: tweet.created_at || null,
    source_text: tweet.text || "",
    media: attachedMedia,
    raw_payload: { tweet, author: user, discovery: { collector: "ice-extra-monitored-v1", manual_review_only: true, lookback_minutes: LOOKBACK_MINUTES } },
    relevant: null,
    claims: [], entities: [], extraction_payload: {}, processing_status: "collected", attempts: 0, last_error: null
  };
}
async function main() {
  requireEnv();
  const startTime = new Date(Date.now() - LOOKBACK_MINUTES * 60000).toISOString();
  const rows = [];
  const stats = { handles: HANDLES, returned: 0, relevant: 0, inserted: 0, failed: [] };
  for (const username of HANDLES) {
    try {
      const user = await resolveUser(username);
      if (!user) throw new Error("账号不存在或无法解析");
      const payload = await timeline(user, startTime);
      for (const tweet of payload?.data || []) {
        stats.returned += 1;
        if (!relevant(tweet.text)) continue;
        stats.relevant += 1;
        rows.push(row(tweet, user, media(tweet, payload?.includes)));
      }
    } catch (error) {
      stats.failed.push({ username, error: String(error.message || error).slice(0, 240) });
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (rows.length) {
    await sb("ice_posts", {
      method: "POST",
      query: { on_conflict: "x_post_id" },
      body: rows,
      prefer: "resolution=ignore-duplicates,return=minimal"
    });
    stats.inserted = rows.length;
  }
  console.log(JSON.stringify(stats, null, 2));
}
main().catch((error) => { console.error("ICE新增监控账号采集失败：", error); process.exitCode = 1; });
