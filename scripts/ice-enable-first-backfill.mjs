#!/usr/bin/env node
import process from "node:process";

function safeJson(value, fallback = null) {
  try { return typeof value === "string" ? JSON.parse(value) : value; }
  catch { return fallback; }
}

function requireEnvironment() {
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]
    .filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}

function headers(prefer = "") {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? safeJson(text, { raw: text }) : null;
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${url} → ${response.status}: ${body?.message || body?.detail || text.slice(0, 500)}`);
  }
  return body;
}

async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  return requestJson(url, {
    method,
    headers: headers(prefer),
    body: body == null ? undefined : JSON.stringify(body),
  });
}

async function main() {
  requireEnvironment();
  const rows = await sb("ice_query_state", {
    query: {
      select: "query_key,last_seen_id,last_result",
      limit: "500",
    },
  });

  const bootstrapRows = (Array.isArray(rows) ? rows : []).filter((row) => {
    const result = safeJson(row.last_result, row.last_result || {});
    return result?.mode === "bootstrap";
  });

  for (const row of bootstrapRows) {
    await sb("ice_query_state", {
      method: "PATCH",
      query: { query_key: `eq.${row.query_key}` },
      body: {
        last_seen_id: null,
        last_result: {
          mode: "backfill_pending",
          enabled_at: new Date().toISOString(),
        },
      },
      prefer: "return=minimal",
    });
  }

  console.log(`ICE首次回填准备完成：重置${bootstrapRows.length}个初始化查询游标`);
}

main().catch((error) => {
  console.error("ICE首次回填准备失败：", error);
  process.exitCode = 1;
});
