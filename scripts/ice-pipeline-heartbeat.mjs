#!/usr/bin/env node
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
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

async function main() {
  requireEnv();
  const stage = String(process.env.ICE_HEARTBEAT_STAGE || "unknown").trim();
  const status = String(process.env.ICE_HEARTBEAT_STATUS || "success").trim().toLowerCase();
  const errorText = String(process.env.ICE_HEARTBEAT_ERROR || "").slice(0, 1500);
  const now = new Date().toISOString();
  const row = {
    query_key: `pipeline:${stage}`,
    query_text: `ICE pipeline heartbeat: ${stage}`,
    last_run_at: now,
    updated_at: now,
    last_error: status === "failure" ? (errorText || `${stage} failed`) : null
  };
  if (status === "success") row.last_success_at = now;

  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/ice_query_state`);
  url.searchParams.set("on_conflict", "query_key");
  const response = await fetch(url, {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify(row)
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || payload?.details || payload?.hint || payload?.raw || `Supabase心跳写入失败：${response.status}`);
  console.log(JSON.stringify({ stage, status, at: now }));
}

main().catch((error) => {
  console.error("ICE流水线心跳写入失败：", error);
  process.exitCode = 1;
});
