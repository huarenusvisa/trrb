#!/usr/bin/env node
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const MAX_ROWS = Number(process.env.ICE_OFFICIAL_FILTER_MAX || 3000);
const OFFICIAL_HANDLE = /^(icegov|dhsgov|hsi_hq|cbp|usbpchief|uscis|dojcrimdiv|thejusticedept|usmarshalshq|fbi|fema|secretservice|ero[a-z0-9_]*|ice[a-z0-9_]*|dhs[a-z0-9_]*|cbp[a-z0-9_]*|usbp[a-z0-9_]*|uscis[a-z0-9_]*|hsi[a-z0-9_]*)$/i;
const OFFICIAL_TYPE = /^(official|government|agency)$/i;
const MONITORED_HANDLE = /^(kimkatieusa|immigrantcrimes|longtimehistory|cartelwatch|storm1news)$/i;
const MONITORED_TYPE = /^(monitored_individual)$/i;

function requireEnv() {
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
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  const response = await fetch(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || payload?.details || payload?.hint || payload?.raw || `Supabase请求失败：${response.status}`);
  return payload;
}
function isAllowed(row) {
  const username = String(row?.source_username || "").replace(/^@/, "").trim();
  const type = String(row?.source_type || "").trim();
  return OFFICIAL_HANDLE.test(username) || OFFICIAL_TYPE.test(type) || MONITORED_HANDLE.test(username) || MONITORED_TYPE.test(type);
}
function chunks(values, size) { const out = []; for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size)); return out; }
async function reject(ids) {
  for (const group of chunks(ids, 100)) {
    await sb("ice_posts", {
      method: "PATCH",
      query: { id: `in.(${group.map((id) => `\"${id}\"`).join(",")})` },
      body: { relevant: false, processing_status: "irrelevant", last_error: "non_allowed_source_filtered" },
      prefer: "return=minimal"
    });
  }
}
async function main() {
  requireEnv();
  const cutoff = new Date(Date.now() - 48 * 3600000).toISOString();
  const rows = await sb("ice_posts", {
    query: {
      select: "id,source_username,source_display_name,source_type,processing_status,relevant,source_created_at,created_at",
      created_at: `gte.${cutoff}`,
      order: "created_at.desc",
      limit: String(MAX_ROWS)
    }
  });
  const active = (Array.isArray(rows) ? rows : []).filter((row) => row.relevant !== false && !["published","irrelevant"].includes(String(row.processing_status || "")));
  const rejected = active.filter((row) => !isAllowed(row)).map((row) => row.id);
  if (rejected.length) await reject(rejected);
  console.log(JSON.stringify({ stage: "official-and-monitored-source-filter-v5", scanned: active.length, kept: active.length - rejected.length, rejected_non_allowed: rejected.length }, null, 2));
}
main().catch((error) => { console.error("ICE允许信源过滤失败：", error); process.exitCode = 1; });
