#!/usr/bin/env node
import process from "node:process";

const X_API = "https://api.x.com/2";
const REQUIRED = ["X_BEARER_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const LOOKBACK_MINUTES = Number(process.env.ICE_PRIORITY_LOOKBACK_MINUTES || 180);
const ACCEPT_AGE_MINUTES = Number(process.env.ICE_MAX_SOURCE_AGE_MINUTES || 180);
const MAX_PAGES = Number(process.env.ICE_PRIORITY_MAX_PAGES || 3);

// 美国官方移民、边境及执法机构账号。地区 ERO 账号由独立采集器补充。
const OFFICIAL_HANDLES = [
  "ICEgov", "DHSgov", "HSI_HQ", "CBP", "USBPChief", "USCIS",
  "DOJCrimDiv", "TheJusticeDept", "USMarshalsHQ", "FBI",
  "CBPPortDirBOS", "CBPPortDirJFK", "CBPPortDirLAX", "CBPPortDirMIA",
  "USBPChiefEPT", "USBPChiefRGV", "USBPChiefTCA", "USBPChiefYUM",
  "HSI_Chicago", "HSI_Houston", "HSI_Miami", "HSINewYork", "HSI_LosAngeles",
  "FEMA", "SecretService"
];

// 指定非官方监控账号：只进入人工审核，绝不自动发布。
const MONITORED_HANDLES = ["KimKatieUSA", "ImmigrantCrimes", "LongTimeHistory"];
const ALL_HANDLES = [...new Set([...OFFICIAL_HANDLES, ...MONITORED_HANDLES])];

function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少 GitHub Secret：${missing.join(", ")}`);
}

function sbHeaders(prefer = "") {
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

async function request(url, options = {}, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const body = await readJson(response);
      if (!response.ok) {
        const error = new Error(`${options.method || "GET"} ${url} → ${response.status}: ${body?.detail || body?.title || body?.message || body?.raw || "未知错误"}`);
        error.status = response.status;
        throw error;
      }
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
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return request(url, {
    method,
    headers: sbHeaders(prefer),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function isRelevant(text) {
  return /\bice\b|immigration and customs enforcement|\bhsi\b|homeland security investigations|\bdhs\b|\bcbp\b|border patrol|uscis|deport|removal|detain|custody|arrest|raid|shoot|shot|killed|death|immigration benefit|immigration policy|smuggl|traffick|fentanyl|counterfeit/i.test(String(text || ""));
}

function ageMinutes(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? (Date.now() - timestamp) / 60000 : Infinity;
}

function isOfficialHandle(username) {
  return OFFICIAL_HANDLES.some((handle) => handle.toLowerCase() === String(username || "").toLowerCase());
}

function isMonitoredHandle(username) {
  return MONITORED_HANDLES.some((handle) => handle.toLowerCase() === String(username || "").toLowerCase());
}

function mediaFromIncludes(tweet, includes) {
  const byKey = new Map((includes?.media || []).map((item) => [item.media_key, item]));
  return (tweet?.attachments?.media_keys || [])
    .map((key) => byKey.get(key))
    .filter(Boolean)
    .map((item) => ({
      type: item.type || "",
      url: item.url || "",
      preview_image_url: item.preview_image_url || "",
      width: item.width || null,
      height: item.height || null,
      duration_ms: item.duration_ms || null,
      variants: Array.isArray(item.variants) ? item.variants : []
    }));
}

function xUrl(username, id) {
  return `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(id)}`;
}

async function resolveUser(username) {
  const url = new URL(`${X_API}/users/by/username/${encodeURIComponent(username)}`);
  url.searchParams.set("user.fields", "id,name,username,verified,public_metrics");
  const payload = await request(url, { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } });
  return payload?.data || null;
}

// 核心修复：逐账号读取用户时间线，不再依赖 recent search 的搜索索引完整性。
async function fetchUserTimeline(user, startTime) {
  const pages = [];
  let paginationToken = "";
  for (let page = 0; page < Math.max(1, Math.min(5, MAX_PAGES)); page += 1) {
    const url = new URL(`${X_API}/users/${encodeURIComponent(user.id)}/tweets`);
    url.searchParams.set("max_results", "100");
    url.searchParams.set("start_time", startTime);
    url.searchParams.set("exclude", "retweets,replies");
    if (paginationToken) url.searchParams.set("pagination_token", paginationToken);
    url.searchParams.set("tweet.fields", "id,text,author_id,created_at,lang,public_metrics,possibly_sensitive,attachments");
    url.searchParams.set("expansions", "attachments.media_keys");
    url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height,duration_ms,variants");
    const payload = await request(url, { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } });
    pages.push(payload);
    paginationToken = payload?.meta?.next_token || "";
    if (!paginationToken) break;
  }
  return pages;
}

// 时间线接口因套餐或临时错误不可用时，才退回单账号 recent search。
async function searchSingleHandle(username, startTime) {
  const url = new URL(`${X_API}/tweets/search/recent`);
  url.searchParams.set("query", `from:${username} -is:retweet -is:reply`);
  url.searchParams.set("max_results", "100");
  url.searchParams.set("start_time", startTime);
  url.searchParams.set("tweet.fields", "id,text,author_id,created_at,lang,public_metrics,possibly_sensitive,attachments");
  url.searchParams.set("expansions", "author_id,attachments.media_keys");
  url.searchParams.set("user.fields", "id,name,username,verified,public_metrics");
  url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height,duration_ms,variants");
  return request(url, { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } });
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

function makeRow(tweet, user, media, collector, manualReviewOnly) {
  const username = String(user.username || "");
  const official = isOfficialHandle(username);
  return {
    x_post_id: String(tweet.id),
    x_url: xUrl(username, tweet.id),
    source_registry_id: null,
    source_username: username,
    source_display_name: user.name || username,
    source_type: official ? "official" : "monitored_individual",
    trust_tier: official ? 1 : 4,
    independence_key: `${official ? "official" : "monitored"}:${username.toLowerCase()}`,
    source_created_at: tweet.created_at || null,
    source_text: tweet.text || "",
    media,
    raw_payload: {
      tweet,
      author: user,
      discovery: {
        collector,
        lookback_minutes: LOOKBACK_MINUTES,
        manual_review_only: manualReviewOnly
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
  const startTime = new Date(Date.now() - LOOKBACK_MINUTES * 60000).toISOString();
  const collected = new Map();
  const stats = { accounts: ALL_HANDLES.length, timeline_ok: 0, fallback_ok: 0, failed: 0, returned: 0, irrelevant: 0, expired: 0 };

  for (const username of ALL_HANDLES) {
    let user = null;
    try {
      user = await resolveUser(username);
      if (!user) throw new Error("账号不存在或无法解析");
      const pages = await fetchUserTimeline(user, startTime);
      stats.timeline_ok += 1;
      for (const payload of pages) {
        for (const tweet of payload?.data || []) {
          stats.returned += 1;
          if (ageMinutes(tweet.created_at) > ACCEPT_AGE_MINUTES) { stats.expired += 1; continue; }
          if (!isRelevant(tweet.text)) { stats.irrelevant += 1; continue; }
          const media = mediaFromIncludes(tweet, payload?.includes);
          collected.set(String(tweet.id), makeRow(tweet, user, media, "ice-direct-timeline-v1", isMonitoredHandle(username)));
        }
      }
    } catch (timelineError) {
      console.warn(`账号时间线读取失败，改用单账号搜索：@${username} — ${timelineError.message}`);
      try {
        const payload = await searchSingleHandle(username, startTime);
        const fallbackUser = (payload?.includes?.users || []).find((item) => String(item.username || "").toLowerCase() === username.toLowerCase()) || user || { username, name: username };
        stats.fallback_ok += 1;
        for (const tweet of payload?.data || []) {
          stats.returned += 1;
          if (ageMinutes(tweet.created_at) > ACCEPT_AGE_MINUTES) { stats.expired += 1; continue; }
          if (!isRelevant(tweet.text)) { stats.irrelevant += 1; continue; }
          const media = mediaFromIncludes(tweet, payload?.includes);
          collected.set(String(tweet.id), makeRow(tweet, fallbackUser, media, "ice-single-search-fallback-v1", isMonitoredHandle(username)));
        }
      } catch (fallbackError) {
        stats.failed += 1;
        console.error(`重点账号采集失败：@${username} — ${fallbackError.message}`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  if (stats.failed === ALL_HANDLES.length && collected.size === 0) {
    throw new Error("所有重点账号采集均失败且没有可用数据");
  }

  const rows = [...collected.values()];
  const exists = await existingIds(rows.map((row) => row.x_post_id));
  const fresh = rows.filter((row) => !exists.has(row.x_post_id));
  if (fresh.length) {
    await sb("ice_posts", {
      method: "POST",
      body: fresh,
      prefer: "resolution=ignore-duplicates,return=minimal"
    });
  }

  console.log(JSON.stringify({
    collector: "ice-direct-timeline-v1",
    ...stats,
    candidates: rows.length,
    database_duplicates: exists.size,
    inserted: fresh.length
  }, null, 2));
}

main().catch((error) => {
  console.error("ICE重点账号采集失败：", error);
  process.exitCode = 1;
});
