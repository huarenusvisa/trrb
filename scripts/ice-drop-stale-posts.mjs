#!/usr/bin/env node
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const MAX_AGE_HOURS = 12;
const BATCH_SIZE = 100;

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
  if (!response.ok) throw new Error(body?.message || body?.details || body?.error || body?.raw || `请求失败（${response.status}）`);
  return body;
}

async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return request(url, {
    method,
    headers: headers(prefer),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function isOlderThanCutoff(row, cutoffMs) {
  const raw = row.source_created_at || row.created_at;
  const time = new Date(raw || 0).getTime();
  return Number.isFinite(time) && time > 0 && time < cutoffMs;
}

async function main() {
  requireEnv();
  const cutoffMs = Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000;
  const rows = await sb("ice_posts", {
    query: {
      select: "id,x_post_id,source_created_at,created_at,processing_status,event_fingerprint",
      processing_status: "in.(collected,processing,extracted,failed)",
      order: "created_at.asc",
      limit: "5000"
    }
  });

  const stale = (Array.isArray(rows) ? rows : []).filter((row) => isOlderThanCutoff(row, cutoffMs));
  for (const batch of chunks(stale.map((row) => row.id), BATCH_SIZE)) {
    await sb("ice_posts", {
      method: "DELETE",
      query: { id: `in.(${batch.join(",")})` },
      prefer: "return=minimal"
    });
  }

  console.log(JSON.stringify({
    stage: "ice-drop-stale-posts",
    max_age_hours: MAX_AGE_HOURS,
    scanned: Array.isArray(rows) ? rows.length : 0,
    deleted: stale.length,
    cutoff: new Date(cutoffMs).toISOString()
  }, null, 2));
}

main().catch((error) => {
  console.error("清理超过12小时的ICE来源帖子失败：", error);
  process.exitCode = 1;
});
