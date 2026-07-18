#!/usr/bin/env node
import crypto from "node:crypto";
import process from "node:process";

const X_API = "https://api.x.com/2";
const LOOKBACK_HOURS = Number(process.env.ICE_ERO_LOOKBACK_HOURS || 3);
const MAX_PAGES_PER_QUERY = 3;

const HANDLES = [
  "ICEgov","DHSgov","HSI_HQ","CBP","USBPChief","USCIS","DOJ_EOIR",
  "EROAtlanta","EROBaltimore","EROBoston","EROBuffalo","EROChicago","ERODallas","ERODenver","ERODetroit",
  "EROElPaso","EROHouston","EROLosAngeles","EROMiami","ERONewark","ERONewOrleans","ERONewYork","EROPhiladelphia",
  "EROPhoenix","EROSaltLakeCity","EROSanAntonio","EROSanDiego","EROSanFrancisco","EROSeattle","EROStPaul","EROWashington"
];

const OFFICIAL_PREFIX = /^(ice|ero|hsi|cbp|usbp|uscis|dhs|eoir)/i;
const OFFICIAL_PROFILE = /immigration and customs enforcement|enforcement and removal operations|homeland security investigations|customs and border protection|u\.s\. border patrol|citizenship and immigration services|department of homeland security|executive office for immigration review/i;

function requireEnv() {
  const missing = ["X_BEARER_TOKEN","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"].filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少 GitHub Secret：${missing.join(", ")}`);
}
function nowIso() { return new Date().toISOString(); }
function lookbackStart() { return new Date(Date.now() - LOOKBACK_HOURS * 3600000).toISOString(); }
function digest(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function maxSnowflake(ids) {
  return ids.reduce((max, id) => { try { return BigInt(id) > BigInt(max || "0") ? String(id) : max; } catch { return String(id) > String(max || "") ? String(id) : max; } }, "");
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function sbHeaders(prefer = "") { return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }; }
async function jsonResponse(response) { const text = await response.text(); if (!text) return null; try { return JSON.parse(text); } catch { return { raw: text }; } }
function errorMessage(body) {
  if (Array.isArray(body?.errors) && body.errors.length) return body.errors.map((item) => item?.message || item?.detail || JSON.stringify(item)).join("; ");
  return body?.detail || body?.title || body?.message || body?.raw || "未知错误";
}
async function request(url, options = {}, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const response = await fetch(url, options);
      const body = await jsonResponse(response);
      if (!response.ok) { const error = new Error(`${options.method || "GET"} ${url} → ${response.status}: ${errorMessage(body)}`); error.status = response.status; throw error; }
      return body;
    } catch (error) {
      last = error;
      if (i === attempts || (error.status && error.status < 500 && error.status !== 429)) throw error;
      await sleep(error.status === 429 ? 15000 * i : 1000 * 2 ** (i - 1));
    }
  }
  throw last;
}
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  return request(url, { method, headers: sbHeaders(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
}
function buildQueries(handles) {
  const unique = [...new Set(handles.map((x) => String(x).replace(/^@/, "").trim()).filter(Boolean))];
  // 每个账号独立查询，避免多个账号合并后搜索索引漏稿。
  const direct = unique.map((handle) => ({ handle, query: `from:${handle} -is:retweet -is:reply` }));
  const discovery = [
    { handle: "discovery-ero", query: '("ICE ERO" OR "Enforcement and Removal Operations" OR "ERO officers") (arrested OR detained OR deported OR removed OR raid OR operation) -is:retweet -is:reply lang:en' },
    { handle: "discovery-hsi", query: '("HSI" OR "Homeland Security Investigations") (arrested OR operation OR raid OR trafficking OR smuggling OR seized OR rescued) -is:retweet -is:reply lang:en' },
    { handle: "discovery-cbp", query: '("CBP" OR "U.S. Border Patrol" OR USBP) (arrested OR apprehended OR seized OR intercepted OR rescued OR operation) -is:retweet -is:reply lang:en' },
    { handle: "discovery-other", query: '("USCIS" OR "DHS" OR "EOIR") (immigration OR enforcement OR fraud OR arrest OR policy OR court) -is:retweet -is:reply lang:en' }
  ];
  return [...direct, ...discovery];
}
async function queryState(key) {
  const rows = await sb("ice_query_state", { query: { select: "*", query_key: `eq.${key}`, limit: "1" } });
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function saveState(row) {
  await sb("ice_query_state", { method: "POST", query: { on_conflict: "query_key" }, body: row, prefer: "resolution=merge-duplicates,return=minimal" });
}
async function searchX(query) {
  const pages = [];
  let next = "";
  for (let page = 0; page < MAX_PAGES_PER_QUERY; page += 1) {
    const url = new URL(`${X_API}/tweets/search/recent`);
    url.searchParams.set("query", query);
    url.searchParams.set("max_results", "100");
    url.searchParams.set("start_time", lookbackStart());
    if (next) url.searchParams.set("next_token", next);
    url.searchParams.set("tweet.fields", "id,text,author_id,created_at,lang,public_metrics,possibly_sensitive,attachments,geo");
    url.searchParams.set("expansions", "author_id,attachments.media_keys,geo.place_id");
    url.searchParams.set("user.fields", "id,name,username,description,verified,public_metrics");
    url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height,duration_ms,variants");
    const payload = await request(url, { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } });
    pages.push(payload);
    next = payload?.meta?.next_token || "";
    if (!next) break;
  }
  return pages;
}
function relevant(text) { return /arrest|apprehend|detain|custody|raid|operation|deport|remov|final order|fugitive|gang|criminal|shoot|shot|gunfire|death|fatal|use of force|vehicle stop|surveillance|seiz|intercept|rescu|traffick|smuggl|fraud|court|policy/i.test(String(text || "")); }
function officialAuthor(author) {
  const username = String(author?.username || "").replace(/^@/, "");
  const profile = `${author?.name || ""} ${author?.description || ""}`;
  return OFFICIAL_PREFIX.test(username) || (Boolean(author?.verified) && OFFICIAL_PROFILE.test(profile));
}
function media(tweet, includes) {
  const byKey = new Map((includes?.media || []).map((item) => [item.media_key, item]));
  return (tweet?.attachments?.media_keys || []).map((key) => byKey.get(key)).filter(Boolean).map((item) => ({ type: item.type || "", url: item.url || "", preview_image_url: item.preview_image_url || "", width: item.width || null, height: item.height || null, duration_ms: item.duration_ms || null, variants: Array.isArray(item.variants) ? item.variants : [] }));
}
function xUrl(username, id) { return username ? `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(id)}` : `https://x.com/i/web/status/${encodeURIComponent(id)}`; }
async function existingIds(ids) {
  if (!ids.length) return new Set();
  const rows = await sb("ice_posts", { query: { select: "x_post_id", x_post_id: `in.(${ids.map((id) => `"${id}"`).join(",")})`, limit: String(Math.min(ids.length, 1000)) } });
  return new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.x_post_id)));
}
async function main() {
  requireEnv();
  const registryRows = await sb("source_registry", { query: { select: "x_username,source_type,enabled", topic_key: "eq.ice", enabled: "eq.true", limit: "1000" } });
  const registryHandles = (Array.isArray(registryRows) ? registryRows : [])
    .filter((row) => row.source_type === "official" && OFFICIAL_PREFIX.test(String(row.x_username || "").replace(/^@/, "")))
    .map((row) => String(row.x_username));
  const queryItems = buildQueries([...HANDLES, ...registryHandles]);
  const collected = new Map();
  let requests = 0;
  let failedQueries = 0;
  const failedHandles = [];
  for (const item of queryItems) {
    const { handle, query } = item;
    const key = `regional-official-${LOOKBACK_HOURS}h-${digest(query).slice(0, 28)}`;
    const state = await queryState(key);
    try {
      const pages = await searchX(query);
      requests += pages.length;
      const seen = [];
      for (const payload of pages) {
        const users = new Map((payload?.includes?.users || []).map((u) => [u.id, u]));
        for (const tweet of payload?.data || []) {
          seen.push(String(tweet.id));
          const author = users.get(tweet.author_id) || {};
          if (!officialAuthor(author)) continue;
          // 已知官方账号直接保留；宽召回发现查询才应用关键词筛选。
          if (handle.startsWith("discovery-") && !relevant(tweet.text)) continue;
          const username = String(author.username || "");
          collected.set(String(tweet.id), {
            x_post_id: String(tweet.id), x_url: xUrl(username, tweet.id), source_registry_id: null,
            source_username: username, source_display_name: author.name || username, source_type: "official", trust_tier: 1,
            independence_key: `official:${username.toLowerCase()}`, source_created_at: tweet.created_at || null, source_text: tweet.text || "",
            media: media(tweet, payload?.includes), raw_payload: { tweet, author, discovery: { collector: `ice-regional-official-${LOOKBACK_HOURS}h-v3`, lookback_hours: LOOKBACK_HOURS, handle, query } },
            relevant: null, event_fingerprint: null, event_type: null, event_date: null, city: null, state_code: null, location_text: null,
            people_count: null, claims: [], entities: [], extraction_confidence: null, extraction_payload: {}, processing_status: "collected", attempts: 0, last_error: null
          });
        }
      }
      await saveState({ query_key: key, query_text: query, last_seen_id: maxSnowflake(seen) || state?.last_seen_id || null, last_run_at: nowIso(), last_success_at: nowIso(), last_error: null, updated_at: nowIso() });
    } catch (error) {
      failedQueries += 1;
      failedHandles.push({ handle, status: error.status || null, error: String(error.message || error).slice(0, 300) });
      await saveState({ query_key: key, query_text: query, last_seen_id: state?.last_seen_id || null, last_run_at: nowIso(), last_error: String(error.message || error).slice(0, 1500), updated_at: nowIso() });
      console.error(`地区官方账号查询失败：${handle}\n${error.message}`);
      // 不再因为一个账号429/失败而停止后续所有地区账号。
      await sleep(error.status === 429 ? 5000 : 300);
    }
  }
  const rows = [...collected.values()];
  const exists = await existingIds(rows.map((row) => row.x_post_id));
  const fresh = rows.filter((row) => !exists.has(row.x_post_id));
  if (fresh.length) await sb("ice_posts", { method: "POST", query: { on_conflict: "x_post_id" }, body: fresh, prefer: "resolution=ignore-duplicates,return=minimal" });
  console.log(JSON.stringify({ collector: "ice-regional-official-v3", lookback_hours: LOOKBACK_HOURS, account_queries: queryItems.filter((x) => !x.handle.startsWith("discovery-")).length, discovery_queries: queryItems.filter((x) => x.handle.startsWith("discovery-")).length, requests, failed_queries: failedQueries, failed_handles: failedHandles, found: rows.length, inserted: fresh.length }, null, 2));
}
main().catch((error) => { console.error("地区官方抓取失败：", error); process.exitCode = 1; });
