#!/usr/bin/env node
import process from "node:process";

const X_API = "https://api.x.com/2";
const REQUIRED = ["X_BEARER_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

const SEARCH_QUERIES = [
  // 高召回：重大执法、枪击、追车、现场视频
  '("ICE agent" OR "ICE agents" OR ICE) (shooting OR shot OR gunfire OR fired OR chase OR crash OR "use of force") -is:retweet lang:en',
  '("Immigration and Customs Enforcement" OR ICE) (arrest OR arrested OR detained OR detention OR raid OR operation OR custody) -is:retweet lang:en',
  '("ICE raid" OR "immigration raid" OR "ICE arrest" OR "ICE detention") (video OR footage OR witness OR breaking OR update) -is:retweet lang:en',
  '("ICE" OR "ERO" OR "HSI") (deportation OR removal OR "removal flight" OR repatriation) -is:retweet lang:en',
  '("ICE" OR "immigration agents") (protest OR courthouse OR school OR hospital OR workplace OR home) -is:retweet lang:en',

  // HSI专项：人口贩卖、儿童营救、地方联合行动和逮捕
  '("HSI" OR "Homeland Security Investigations") (arrest OR arrested OR operation OR raid OR trafficking OR "human trafficking" OR smuggling) -is:retweet lang:en',
  '("HSI" OR "Homeland Security Investigations") (rescued OR recovered OR located OR "missing children" OR child OR children OR victim OR victims) -is:retweet lang:en',

  // 官方机构与主要媒体，即使正文没有完整关键词，也尽量覆盖
  '(from:ICEgov OR from:DHSgov OR from:HSI_HQ OR from:CBP OR from:DOJCrimDiv) -is:retweet',
  '(from:Reuters OR from:AP OR from:ABC OR from:CBSNews OR from:NBCNews OR from:CNN OR from:FoxNews) (ICE OR immigration OR HSI) -is:retweet',

  // 地点+行动词，解决帖子只写“agents”而未反复写ICE的问题
  '("federal agents" OR "immigration agents" OR "HSI agents") (arrest OR arrested OR shooting OR raid OR detention OR chase OR operation) -is:retweet lang:en'
];

function envInt(name, fallback, min = 0, max = 1000) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
}

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

async function readJson(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function request(url, options = {}, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, options);
      const data = await readJson(res);
      if (!res.ok) {
        const error = new Error(`${options.method || "GET"} ${url} → ${res.status}: ${data?.detail || data?.title || data?.message || data?.raw || "未知错误"}`);
        error.status = res.status;
        throw error;
      }
      return data;
    } catch (error) {
      last = error;
      if (i === attempts || (error.status && error.status < 500 && error.status !== 429)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (i - 1)));
    }
  }
  throw last;
}

async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return request(url, {
    method,
    headers: sbHeaders(prefer),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function xHeaders() {
  return { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` };
}

function mediaFromIncludes(tweet, includes) {
  const keys = tweet?.attachments?.media_keys || [];
  const byKey = new Map((includes?.media || []).map((item) => [item.media_key, item]));
  return keys.map((key) => byKey.get(key)).filter(Boolean).map((item) => ({
    type: item.type || "",
    url: item.url || "",
    preview_image_url: item.preview_image_url || "",
    width: item.width || null,
    height: item.height || null,
    duration_ms: item.duration_ms || null,
    variants: Array.isArray(item.variants) ? item.variants : []
  }));
}

function authorMap(includes) {
  return new Map((includes?.users || []).map((user) => [user.id, user]));
}

function relevanceScore(text, mediaCount, author) {
  const value = String(text || "").toLowerCase();
  let score = 0;

  if (/\bice\b|immigration and customs enforcement|immigration agents|federal agents|\bero\b|\bhsi\b|homeland security investigations/.test(value)) score += 35;
  if (/shoot|shot|gunfire|fired|chase|raid|arrest|detain|detention|deport|removal|custody|operation|use of force|traffick|smuggl|rescued|recovered|missing children/.test(value)) score += 30;
  if (/video|footage|breaking|update|witness|scene|现场|视频/.test(value)) score += 12;
  if (mediaCount > 0) score += 13;
  if (author?.verified) score += 10;
  if (Number(author?.public_metrics?.followers_count || 0) >= 10000) score += 8;

  return Math.min(100, score);
}

function eligible(text, media, author) {
  const score = relevanceScore(text, media.length, author);
  const minScore = envInt("ICE_HIGH_RECALL_MIN_SCORE", 45, 1, 100);
  const followers = Number(author?.public_metrics?.followers_count || 0);
  const minFollowers = envInt("ICE_HIGH_RECALL_MIN_FOLLOWERS", 500, 0, 100000000);

  const major = /shoot|shot|gunfire|fired|raid|arrest|detain|deport|removal|chase|traffick|rescued|missing children/.test(String(text || "").toLowerCase());
  const sourceOk = Boolean(author?.verified) || followers >= minFollowers || (media.length > 0 && major);

  return score >= minScore && sourceOk;
}

async function searchX(query, startTime) {
  const pages = [];
  const maxPages = envInt("ICE_HIGH_RECALL_MAX_PAGES", 3, 1, 10);
  let nextToken = "";

  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`${X_API}/tweets/search/recent`);
    url.searchParams.set("query", query);
    url.searchParams.set("max_results", String(envInt("ICE_HIGH_RECALL_RESULTS_PER_QUERY", 100, 10, 100)));
    url.searchParams.set("start_time", startTime);
    if (nextToken) url.searchParams.set("next_token", nextToken);

    // 不再请求 geo/place 扩展，避免 X recent-search 参数兼容性导致 400。
    url.searchParams.set("tweet.fields", "id,text,author_id,created_at,lang,public_metrics,possibly_sensitive,attachments");
    url.searchParams.set("expansions", "author_id,attachments.media_keys");
    url.searchParams.set("user.fields", "id,name,username,verified,public_metrics");
    url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height,duration_ms,variants");

    const payload = await request(url, { headers: xHeaders() });
    pages.push(payload);
    nextToken = payload?.meta?.next_token || "";
    if (!nextToken) break;
  }

  return pages;
}

async function existingIds(ids) {
  if (!ids.length) return new Set();
  const rows = await sb("ice_posts", {
    query: {
      select: "x_post_id",
      x_post_id: `in.(${ids.map((id) => `"${id}"`).join(",")})`
    }
  });
  return new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.x_post_id)));
}

function xUrl(username, id) {
  return username
    ? `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(id)}`
    : `https://x.com/i/web/status/${encodeURIComponent(id)}`;
}

async function insertRows(rows) {
  if (!rows.length) return [];
  const result = await sb("ice_posts", {
    method: "POST",
    body: rows,
    prefer: "resolution=ignore-duplicates,return=representation"
  });
  return Array.isArray(result) ? result : [];
}

async function main() {
  requireEnv();

  const hours = envInt("ICE_HIGH_RECALL_LOOKBACK_HOURS", 24, 1, 168);
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const collected = new Map();
  let requests = 0;
  let failedQueries = 0;

  for (const query of SEARCH_QUERIES) {
    try {
      const pages = await searchX(query, startTime);
      requests += pages.length;

      for (const payload of pages) {
        const authors = authorMap(payload?.includes);
        for (const tweet of payload?.data || []) {
          const author = authors.get(tweet.author_id) || {};
          const media = mediaFromIncludes(tweet, payload?.includes);

          if (!eligible(tweet.text, media, author)) continue;

          const score = relevanceScore(tweet.text, media.length, author);
          collected.set(String(tweet.id), {
            x_post_id: String(tweet.id),
            x_url: xUrl(author.username, tweet.id),
            source_registry_id: null,
            source_username: author.username || "",
            source_display_name: author.name || "",
            source_type: author.verified ? "verified_discovered" : "discovered_individual",
            trust_tier: author.verified ? 3 : 5,
            independence_key: author.username ? `x:${String(author.username).toLowerCase()}` : `x-user:${tweet.author_id}`,
            source_created_at: tweet.created_at || null,
            source_text: tweet.text || "",
            media,
            raw_payload: {
              tweet,
              author,
              discovery: {
                collector: "ice-high-recall-v4",
                relevance_score: score,
                query
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
          });
        }
      }
    } catch (error) {
      failedQueries += 1;
      console.error(`查询失败：${query}\n${error.message}`);
      if (error.status === 429) break;
    }
  }

  if (failedQueries > 0) {
    throw new Error(`ICE高召回抓取有${failedQueries}组查询失败，拒绝伪装为成功。`);
  }

  const candidates = [...collected.values()];
  const duplicates = await existingIds(candidates.map((row) => row.x_post_id));
  const fresh = candidates.filter((row) => !duplicates.has(row.x_post_id));
  const inserted = await insertRows(fresh);

  console.log(JSON.stringify({
    collector: "ice-high-recall-v4",
    lookback_hours: hours,
    max_pages_per_query: envInt("ICE_HIGH_RECALL_MAX_PAGES", 3, 1, 10),
    x_requests: requests,
    candidates: candidates.length,
    duplicates: duplicates.size,
    inserted: inserted.length
  }, null, 2));
}

main().catch((error) => {
  console.error("ICE高召回抓取失败：", error);
  process.exitCode = 1;
});
