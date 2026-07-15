#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  loadPolicy,
  selectedSources,
  sourceQuery,
  queryKey,
  acceptTweet,
  mediaFor
} from "./ice-v2-collector-core.mjs";

const X_API = "https://api.x.com/2";
const MODE = process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1] || "official";
const REQUIRED = ["X_BEARER_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function nowIso() { return new Date().toISOString(); }
function maxSnowflake(ids) {
  return ids.reduce((max, id) => {
    if (!id) return max;
    try { return BigInt(id) > BigInt(max || "0") ? String(id) : max; }
    catch { return String(id) > String(max || "") ? String(id) : max; }
  }, "");
}
function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}
async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await readJson(response);
  if (!response.ok) throw new Error(body?.detail || body?.title || body?.message || body?.raw || `${response.status}`);
  return body;
}
function sbHeaders(prefer = "") {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  return request(url, {
    method,
    headers: sbHeaders(prefer),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
async function queryState(key) {
  const rows = await sb("ice_query_state", { query: { select: "*", query_key: `eq.${key}`, limit: "1" } });
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function saveState(row) {
  await sb("ice_query_state", {
    method: "POST",
    query: { on_conflict: "query_key" },
    body: row,
    prefer: "resolution=merge-duplicates,return=minimal"
  });
}
function searchUrl(source, state, nextToken = "") {
  const url = new URL(`${X_API}/tweets/search/recent`);
  url.searchParams.set("query", sourceQuery(source));
  url.searchParams.set("max_results", "100");
  url.searchParams.set("tweet.fields", "id,text,author_id,created_at,referenced_tweets,in_reply_to_user_id,attachments,lang");
  url.searchParams.set("expansions", "author_id,attachments.media_keys");
  url.searchParams.set("user.fields", "id,name,username,verified");
  url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height");
  if (state?.last_seen_id) url.searchParams.set("since_id", state.last_seen_id);
  if (nextToken) url.searchParams.set("next_token", nextToken);
  return url;
}
async function fetchSource(source, state) {
  const output = [];
  let nextToken = "";
  for (let page = 0; page < 3; page += 1) {
    const payload = await request(searchUrl(source, state, nextToken), {
      headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }
    });
    const users = new Map((payload?.includes?.users || []).map((user) => [user.id, user]));
    for (const tweet of payload?.data || []) output.push({ tweet, author: users.get(tweet.author_id) || {}, includes: payload?.includes || {} });
    nextToken = payload?.meta?.next_token || "";
    if (!nextToken) break;
  }
  return output;
}
async function postExists(id) {
  const rows = await sb("ice_posts", { query: { select: "id", x_post_id: `eq.${id}`, limit: "1" } });
  return Array.isArray(rows) && Boolean(rows[0]);
}
function sourceType(source) {
  return source.class === "newsroom" ? "major_media" : "official";
}
async function insertPost(source, item) {
  const username = item.author.username || source.handle;
  await sb("ice_posts", {
    method: "POST",
    body: {
      x_post_id: item.tweet.id,
      x_url: `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(item.tweet.id)}`,
      source_registry_id: null,
      source_username: username,
      source_display_name: item.author.name || source.name || username,
      source_type: sourceType(source),
      trust_tier: source.class === "newsroom" ? 2 : 1,
      independence_key: `${source.class}:${String(source.key || username).toLowerCase()}`,
      source_created_at: item.tweet.created_at || null,
      source_text: item.tweet.text || "",
      media: mediaFor(item.tweet, item.includes),
      raw_payload: {
        tweet: item.tweet,
        author: item.author,
        source_policy_key: source.key,
        source_class: source.class,
        collector: "ice-v2"
      },
      processing_status: "collected"
    },
    prefer: "return=minimal"
  });
}
async function collectSource(policy, source) {
  const key = queryKey(source);
  const state = await queryState(key);
  const started = nowIso();
  try {
    const rows = await fetchSource(source, state);
    let inserted = 0;
    let rejected = 0;
    for (const item of rows) {
      const decision = acceptTweet(policy, source, item.tweet, item.author);
      if (!decision.accepted) { rejected += 1; continue; }
      if (await postExists(item.tweet.id)) continue;
      await insertPost(source, item);
      inserted += 1;
    }
    await saveState({
      query_key: key,
      query_text: sourceQuery(source),
      last_seen_id: maxSnowflake(rows.map((item) => item.tweet.id)) || state?.last_seen_id || null,
      bootstrap_at: state?.bootstrap_at || started,
      last_run_at: started,
      last_success_at: nowIso(),
      last_error: null,
      last_result: { collector: "ice-v2", mode: MODE, fetched: rows.length, inserted, rejected },
      updated_at: nowIso()
    });
    return { fetched: rows.length, inserted, rejected };
  } catch (error) {
    await saveState({
      query_key: key,
      query_text: sourceQuery(source),
      last_seen_id: state?.last_seen_id || null,
      bootstrap_at: state?.bootstrap_at || null,
      last_run_at: started,
      last_error: String(error.message || error).slice(0, 2000),
      last_result: { collector: "ice-v2", mode: MODE, error: String(error.message || error) },
      updated_at: nowIso()
    });
    console.error(`${source.handle}: ${error.message || error}`);
    return { fetched: 0, inserted: 0, rejected: 0, failed: 1 };
  }
}
async function main() {
  requireEnv();
  const policy = await loadPolicy();
  const sources = selectedSources(policy, MODE);
  const totals = { sources: sources.length, fetched: 0, inserted: 0, rejected: 0, failed: 0 };
  for (const source of sources) {
    const result = await collectSource(policy, source);
    for (const key of ["fetched", "inserted", "rejected", "failed"]) totals[key] += Number(result[key] || 0);
  }
  console.log(JSON.stringify({ stage: "ice-v2-collector", mode: MODE, ...totals }));
}

export { collectSource, sourceType, searchUrl };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("ICE v2 collector failed:", error);
    process.exitCode = 1;
  });
}
