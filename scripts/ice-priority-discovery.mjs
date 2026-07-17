#!/usr/bin/env node
import process from "node:process";

const X_API = "https://api.x.com/2";
const REQUIRED = ["X_BEARER_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const LOOKBACK_MINUTES = Number(process.env.ICE_PRIORITY_LOOKBACK_MINUTES || 75);
const ACCEPT_AGE_MINUTES = Number(process.env.ICE_MAX_SOURCE_AGE_MINUTES || 60);
const MAX_PAGES = Number(process.env.ICE_PRIORITY_MAX_PAGES || 3);

// 仅采集美国官方移民、边境及执法机构账号。地区 ERO 账号由独立采集器负责。
const OFFICIAL_HANDLES = [
  "ICEgov", "DHSgov", "HSI_HQ", "CBP", "USBPChief", "USCIS",
  "DOJCrimDiv", "TheJusticeDept", "USMarshalsHQ", "FBI",
  "CBPPortDirBOS", "CBPPortDirJFK", "CBPPortDirLAX", "CBPPortDirMIA",
  "USBPChiefEPT", "USBPChiefRGV", "USBPChiefTCA", "USBPChiefYUM",
  "HSI_Chicago", "HSI_Houston", "HSI_Miami", "HSINewYork", "HSI_LosAngeles",
  "FEMA", "SecretService"
];
// 指定非官方监控账号：只进入人工审核，绝不自动发布。
const MONITORED_HANDLES = ["KimKatieUSA", "ImmigrantCrimes"];
const ALL_HANDLES = [...OFFICIAL_HANDLES, ...MONITORED_HANDLES];

function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少 GitHub Secret：${missing.join(", ")}`);
}
function sbHeaders(prefer = "") {
  return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}
async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
async function request(url, options = {}, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const body = await readJson(response);
      if (!response.ok) { const error = new Error(`${options.method || "GET"} ${url} → ${response.status}: ${body?.detail || body?.title || body?.message || body?.raw || "未知错误"}`); error.status = response.status; throw error; }
      return body;
    } catch (error) {
      last = error;
      if (attempt === attempts || (error.status && error.status < 500 && error.status !== 429)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw last;
}
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  return request(url, { method, headers: sbHeaders(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
}
function chunks(values, size) { const out = []; for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size)); return out; }
function buildQueries() {
  return chunks([...new Set(ALL_HANDLES)], 6).map((group) => `(${group.map((handle) => `from:${handle}`).join(" OR ")}) -is:retweet -is:reply`);
}
function authorMap(includes) { return new Map((includes?.users || []).map((user) => [user.id, user])); }
function mediaFromIncludes(tweet, includes) {
  const byKey = new Map((includes?.media || []).map((item) => [item.media_key, item]));
  return (tweet?.attachments?.media_keys || []).map((key) => byKey.get(key)).filter(Boolean).map((item) => ({ type: item.type || "", url: item.url || "", preview_image_url: item.preview_image_url || "", width: item.width || null, height: item.height || null, duration_ms: item.duration_ms || null, variants: Array.isArray(item.variants) ? item.variants : [] }));
}
function isRelevant(text) {
  return /\bice\b|immigration and customs enforcement|\bhsi\b|homeland security investigations|\bdhs\b|\bcbp\b|border patrol|uscis|deport|removal|detain|custody|arrest|raid|shoot|shot|killed|death|immigration benefit|immigration policy/i.test(String(text || ""));
}
function ageMinutes(value) { const timestamp = new Date(value || 0).getTime(); return Number.isFinite(timestamp) ? (Date.now() - timestamp) / 60000 : Infinity; }
async function searchX(query, startTime) {
  const pages = []; let nextToken = "";
  for (let page = 0; page < Math.max(1, Math.min(5, MAX_PAGES)); page += 1) {
    const url = new URL(`${X_API}/tweets/search/recent`);
    url.searchParams.set("query", query); url.searchParams.set("max_results", "100"); url.searchParams.set("start_time", startTime);
    if (nextToken) url.searchParams.set("next_token", nextToken);
    url.searchParams.set("tweet.fields", "id,text,author_id,created_at,lang,public_metrics,possibly_sensitive,attachments");
    url.searchParams.set("expansions", "author_id,attachments.media_keys");
    url.searchParams.set("user.fields", "id,name,username,verified,public_metrics");
    url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height,duration_ms,variants");
    const payload = await request(url, { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } });
    pages.push(payload); nextToken = payload?.meta?.next_token || ""; if (!nextToken) break;
  }
  return pages;
}
async function existingIds(ids) {
  if (!ids.length) return new Set();
  const rows = await sb("ice_posts", { query: { select: "x_post_id", x_post_id: `in.(${ids.map((id) => `\"${id}\"`).join(",")})`, limit: "1000" } });
  return new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.x_post_id)));
}
function xUrl(username, id) { return username ? `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(id)}` : `https://x.com/i/web/status/${encodeURIComponent(id)}`; }
function isOfficialHandle(username) { return OFFICIAL_HANDLES.some((handle) => handle.toLowerCase() === username.toLowerCase()); }
function isMonitoredHandle(username) { return MONITORED_HANDLES.some((handle) => handle.toLowerCase() === username.toLowerCase()); }

async function main() {
  requireEnv();
  const startTime = new Date(Date.now() - LOOKBACK_MINUTES * 60000).toISOString();
  const collected = new Map(); let requests = 0; let failed = 0;
  for (const query of buildQueries()) {
    try {
      const pages = await searchX(query, startTime); requests += pages.length;
      for (const payload of pages) {
        const authors = authorMap(payload?.includes);
        for (const tweet of payload?.data || []) {
          if (!isRelevant(tweet.text) || ageMinutes(tweet.created_at) > ACCEPT_AGE_MINUTES) continue;
          const author = authors.get(tweet.author_id) || {}; const username = String(author.username || "");
          if (!isOfficialHandle(username) && !isMonitoredHandle(username)) continue;
          const official = isOfficialHandle(username);
          const media = mediaFromIncludes(tweet, payload?.includes);
          collected.set(String(tweet.id), {
            x_post_id: String(tweet.id), x_url: xUrl(username, tweet.id), source_registry_id: null,
            source_username: username, source_display_name: author.name || username, source_type: official ? "official" : "monitored_individual", trust_tier: official ? 1 : 4,
            independence_key: `${official ? "official" : "monitored"}:${username.toLowerCase()}`, source_created_at: tweet.created_at || null, source_text: tweet.text || "", media,
            raw_payload: { tweet, author, discovery: { collector: "ice-priority-v4", query, lookback_minutes: LOOKBACK_MINUTES, manual_review_only: !official } },
            relevant: null, event_fingerprint: null, event_type: null, event_date: null, city: null, state_code: null,
            location_text: null, people_count: null, claims: [], entities: [], extraction_confidence: null,
            extraction_payload: {}, processing_status: "collected", attempts: 0, last_error: null
          });
        }
      }
    } catch (error) { failed += 1; console.error(`重点补抓失败：${query}\n${error.message}`); if (error.status === 429) break; }
  }
  if (failed > 0 && collected.size === 0) throw new Error(`重点补抓有${failed}组查询失败且无可用数据`);
  const rows = [...collected.values()]; const exists = await existingIds(rows.map((row) => row.x_post_id)); const fresh = rows.filter((row) => !exists.has(row.x_post_id));
  if (fresh.length) await sb("ice_posts", { method: "POST", body: fresh, prefer: "resolution=ignore-duplicates,return=minimal" });
  console.log(JSON.stringify({ collector: "ice-priority-v4", requests, candidates: rows.length, duplicates: exists.size, inserted: fresh.length, failed_queries: failed }, null, 2));
}
main().catch((error) => { console.error("ICE重点补抓失败：", error); process.exitCode = 1; });