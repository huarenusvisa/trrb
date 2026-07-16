#!/usr/bin/env node
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const STUCK_MINUTES = Number(process.env.ICE_STUCK_PROCESSING_MINUTES || 30);
const BATCH_SIZE = Number(process.env.ICE_MAINTENANCE_BATCH_SIZE || 500);

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
    throw new Error(body?.message || body?.details || body?.hint || body?.error || body?.raw || `${response.status}`);
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

function inFilter(values) {
  return `in.(${values.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(",")})`;
}

async function recoverStuckPosts() {
  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60000).toISOString();
  const rows = await sb("ice_posts", {
    query: {
      select: "id,processing_status,updated_at,last_error",
      processing_status: "eq.processing",
      updated_at: `lt.${cutoff}`,
      order: "updated_at.asc",
      limit: String(BATCH_SIZE)
    }
  });
  const stuck = Array.isArray(rows) ? rows : [];
  if (!stuck.length) return 0;

  await sb("ice_posts", {
    method: "PATCH",
    query: { id: inFilter(stuck.map((row) => row.id)) },
    body: {
      processing_status: "collected",
      last_error: "night_maintenance_recovered_stuck_processing",
      updated_at: new Date().toISOString()
    },
    prefer: "return=minimal"
  });
  return stuck.length;
}

async function recoverFailedPosts() {
  const cutoff = new Date(Date.now() - 60 * 60000).toISOString();
  const rows = await sb("ice_posts", {
    query: {
      select: "id,processing_status,attempts,updated_at,last_error",
      processing_status: "eq.failed",
      updated_at: `lt.${cutoff}`,
      attempts: "lt.5",
      order: "updated_at.asc",
      limit: String(BATCH_SIZE)
    }
  });
  const retryable = Array.isArray(rows) ? rows : [];
  if (!retryable.length) return 0;

  await sb("ice_posts", {
    method: "PATCH",
    query: { id: inFilter(retryable.map((row) => row.id)) },
    body: {
      processing_status: "collected",
      last_error: "night_maintenance_retry_failed_post",
      updated_at: new Date().toISOString()
    },
    prefer: "return=minimal"
  });
  return retryable.length;
}

async function count(table, query = {}) {
  const rows = await sb(table, { query: { select: "id", ...query, limit: "1" } });
  return Array.isArray(rows) ? rows.length : 0;
}

async function main() {
  requireEnv();
  const recoveredStuck = await recoverStuckPosts();
  const recoveredFailed = await recoverFailedPosts();
  const pendingProbe = await count("ice_posts", { processing_status: "eq.collected" });
  const reviewProbe = await count("ice_stories", { status: "in.(collecting,pending_review,pending_corroboration)" });

  console.log(JSON.stringify({
    stage: "ice-night-maintenance-v1",
    new_york_time: new Intl.DateTimeFormat("zh-CN", {
      timeZone: "America/New_York",
      dateStyle: "full",
      timeStyle: "long"
    }).format(new Date()),
    recovered_stuck_posts: recoveredStuck,
    recovered_failed_posts: recoveredFailed,
    pending_queue_reachable: pendingProbe >= 0,
    review_queue_reachable: reviewProbe >= 0,
    status: "ready"
  }));
}

main().catch((error) => {
  console.error("ICE夜间自修复失败：", error);
  process.exitCode = 1;
});
