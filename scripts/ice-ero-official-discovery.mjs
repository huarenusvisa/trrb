#!/usr/bin/env node
import crypto from "node:crypto";
import process from "node:process";

const X_API = "https://api.x.com/2";
const LOOKBACK_HOURS = 2;
const MAX_PAGES_PER_QUERY = 5;
const REQUIRED = ["X_BEARER_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

// Candidate handles are validated from the returned X profile before a post is accepted.
// A nonexistent or renamed handle produces no accepted rows and cannot create a fake source.
const SEEDED_ERO_HANDLES = [
  "EROAtlanta",
  "EROBaltimore",
  "EROBoston",
  "EROBuffalo",
  "EROChicago",
  "ERODallas",
  "ERODenver",
  "ERODetroit",
  "EROElPaso",
  "EROHouston",
  "EROLosAngeles",
  "EROMiami",
  "ERONewark",
  "ERONewOrleans",
  "ERONewYork",
  "EROPhiladelphia",
  "EROPhoenix",
  "EROSaltLakeCity",
  "EROSanAntonio",
  "EROSanDiego",
  "EROSanFrancisco",
  "EROSeattle",
  "EROStPaul",
  "EROWashington"
];

function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少 GitHub Secret：${missing.join(", ")}`);
}

function nowIso() {
  return new Date().toISOString();
}

function twoHourStart() {
  return new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function maxSnowflake(ids) {
  return ids.reduce((max, id) => {
    if (!id) return max;
    try { return BigInt(id) > BigInt(max || "0") ? String(id) : max; }
    catch { return String(id) > String(max || "") ? String(id) : max; }
  }, "");
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
  try { return JSON.parse(text); }
  catch { return { raw: text }; }
}

async function request(url, options = {}, attempts = 3) {
  let lastError;
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
      lastError = error;
      if (attempt === attempts || (error.status && error.status < 500 && error.status !== 429)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
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

function chunk(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

async function registeredEroHandles() {
  const rows = await sb("source_registry", {
    query: {
      select: "x_username,source_type,enabled",
      topic_key: "eq.ice",
      enabled: "eq.true",
      limit: "200"
    }
  });
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row.source_type === "official" && /^ero/i.test(String(row.x_username || "")))
    .map((row) => String(row.x_username));
}

function buildQueries(handles) {
  const direct = chunk([...new Set(handles.map((value) => String(value).trim()).filter(Boolean))], 8)
    .map((batch) => `(${batch.map((handle) => `from:${handle}`).join(" OR ")}) -is:retweet -is:reply`);

  // This query discovers regional ERO accounts not yet in the seed list.
  direct.push('("ICE ERO" OR "Enforcement and Removal Operations" OR "ERO officers") (arrested OR detained OR deported OR removed OR removal OR "final order of removal" OR raid OR operation) -is:retweet lang:en');
  return direct;
}

async function queryState(key) {
  const rows = await sb("ice_query_state", {
    query: { select: "*", query_key: `eq.${key}`, limit: "1" }
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function saveQueryState(row) {
  await sb("ice_query_state", {
    method: "POST",
    query: { on_conflict: "query_key" },
    body: row,
    prefer: "resolution=merge-duplicates,return=minimal"
  });
}

async function searchX(query, state) {
  const output = [];
  let token = "";
  let pages = 0;
  do {
    const url = new URL(`${X_API}/tweets/search/recent`);
    url.searchParams.set("query", query);
    url.searchParams.set("max_results", "100");
    url.searchParams.set("start_time", twoHourStart());
    if (state?.last_seen_id) url.searchParams.set("since_id", state.last_seen_id);
    if (token) url.searchParams.set("next_token", token);
    url.searchParams.set("tweet.fields", "id,text,author_id,created_at,lang,public_metrics,possibly_sensitive,attachments,geo");
    url.searchParams.set("expansions", "author_id,attachments.media_keys,geo.place_id");
    url.searchParams.set("user.fields", "id,name,username,description,verified,public_metrics");
    url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height,duration_ms,variants");
    url.searchParams.set("place.fields", "id,full_name,country,country_code,geo,name,place_type");

    const payload = await request(url, { headers: xHeaders() });
    output.push(payload);
    token = payload?.meta?.next_token || "";
    pages += 1;
  } while (token && pages < MAX_PAGES_PER_QUERY);

  return output;
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

function officialEroAuthor(author, seeded) {
  const username = String(author?.username || "").toLowerCase();
  const profile = `${author?.name || ""} ${author?.description || ""}`.toLowerCase();
  const handleLooksRegional = /^ero[a-z0-9_]+$/.test(username);
  const profileLooksOfficial = /immigration and customs enforcement|enforcement and removal operations|\bice\b/.test(profile);
  const seededHandle = seeded.has(username);
  return (seededHandle || handleLooksRegional) && profileLooksOfficial && Boolean(author?.verified);
}

function relevantEroPost(text) {
  const value = String(text || "").toLowerCase();
  return /arrest|detain|custody|raid|operation|deport|remov|final order|fugitive|gang|criminal|sex offender|shoot|shot|gunfire|death|died|fatal|use of force|vehicle stop|surveillance/.test(value);
}

function xUrl(username, id) {
  return username
    ? `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(id)}`
    : `https://x.com/i/web/status/${encodeURIComponent(id)}`;
}

async function existingIds(ids) {
  if (!ids.length) return new Set();
  const rows = await sb("ice_posts", {
    query: {
      select: "x_post_id",
      x_post_id: `in.(${ids.map((id) => `"${id}"`).join(",")})`,
      limit: String(Math.min(ids.length, 1000))
    }
  });
  return new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.x_post_id)));
}

async function upsertOfficialSource(author) {
  const username = String(author.username || "");
  await sb("source_registry", {
    method: "POST",
    query: { on_conflict: "topic_key,x_username" },
    body: {
      topic_key: "ice",
      x_username: username,
      display_name: author.name || username,
      source_type: "official",
      trust_tier: 1,
      independence_key: `ero:${username.toLowerCase()}`,
      enabled: true,
      requires_corroboration: false,
      validated: true,
      x_user_id: author.id || null,
      profile: author,
      last_validated_at: nowIso()
    },
    prefer: "resolution=merge-duplicates,return=minimal"
  });

  const rows = await sb("source_registry", {
    query: {
      select: "id",
      topic_key: "eq.ice",
      x_username: `eq.${username}`,
      limit: "1"
    }
  });
  return Array.isArray(rows) ? rows[0]?.id || null : null;
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
  const handles = [...SEEDED_ERO_HANDLES, ...(await registeredEroHandles())];
  const seeded = new Set(handles.map((value) => value.toLowerCase()));
  const queries = buildQueries(handles);
  const collected = new Map();
  let xRequests = 0;

  for (const query of queries) {
    const key = `ero-official-2h-${digest(query).slice(0, 32)}`;
    const state = await queryState(key);
    const started = nowIso();
    try {
      const pages = await searchX(query, state);
      xRequests += pages.length;
      const seenIds = [];

      for (const payload of pages) {
        const authors = new Map((payload?.includes?.users || []).map((user) => [user.id, user]));
        for (const tweet of payload?.data || []) {
          seenIds.push(String(tweet.id));
          const author = authors.get(tweet.author_id) || {};
          if (!officialEroAuthor(author, seeded)) continue;
          if (!relevantEroPost(tweet.text)) continue;
          const sourceRegistryId = await upsertOfficialSource(author);
          collected.set(String(tweet.id), {
            x_post_id: String(tweet.id),
            x_url: xUrl(author.username, tweet.id),
            source_registry_id: sourceRegistryId,
            source_username: author.username || "",
            source_display_name: author.name || author.username || "",
            source_type: "official",
            trust_tier: 1,
            independence_key: `ero:${String(author.username || "").toLowerCase()}`,
            source_created_at: tweet.created_at || null,
            source_text: tweet.text || "",
            media: mediaFromIncludes(tweet, payload?.includes),
            raw_payload: {
              tweet,
              author,
              discovery: {
                collector: "ice-ero-official-2h-v1",
                lookback_hours: LOOKBACK_HOURS,
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

      await saveQueryState({
        query_key: key,
        query_text: query,
        last_seen_id: maxSnowflake(seenIds) || state?.last_seen_id || null,
        bootstrap_at: state?.bootstrap_at || started,
        last_run_at: started,
        last_success_at: nowIso(),
        last_error: null,
        last_result: { lookback_hours: LOOKBACK_HOURS, fetched: seenIds.length },
        updated_at: nowIso()
      });
    } catch (error) {
      await saveQueryState({
        query_key: key,
        query_text: query,
        last_seen_id: state?.last_seen_id || null,
        bootstrap_at: state?.bootstrap_at || started,
        last_run_at: started,
        last_success_at: state?.last_success_at || null,
        last_error: String(error.message || error).slice(0, 2000),
        last_result: { error: String(error.message || error), lookback_hours: LOOKBACK_HOURS },
        updated_at: nowIso()
      });
      console.error(`ERO查询失败：${query}\n${error.message}`);
      if (error.status === 429) break;
    }
  }

  const candidates = [...collected.values()];
  const duplicates = await existingIds(candidates.map((row) => row.x_post_id));
  const fresh = candidates.filter((row) => !duplicates.has(row.x_post_id));
  const inserted = await insertRows(fresh);

  console.log(JSON.stringify({
    collector: "ice-ero-official-2h-v1",
    hard_lookback_hours: LOOKBACK_HOURS,
    queries: queries.length,
    x_requests: xRequests,
    candidates: candidates.length,
    duplicates: duplicates.size,
    inserted: inserted.length
  }, null, 2));
}

main().catch((error) => {
  console.error("ERO地区官方两小时补抓失败：", error);
  process.exitCode = 1;
});
