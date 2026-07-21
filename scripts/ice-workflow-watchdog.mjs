#!/usr/bin/env node
import process from "node:process";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`缺少环境变量：${name}`);
}

const maxAgeMinutes = Number(process.env.ICE_WATCHDOG_MAX_AGE_MINUTES || 50);
const base = String(process.env.SUPABASE_URL).replace(/\/+$/, "");
const url = new URL(`${base}/rest/v1/ice_query_state`);
url.searchParams.set("select", "query_key,last_run_at,last_success_at,last_error");
url.searchParams.set("query_key", "eq.pipeline:unified-pipeline");
url.searchParams.set("limit", "1");

const response = await fetch(url, {
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
  }
});
if (!response.ok) throw new Error(`读取ICE心跳失败：${response.status} ${await response.text()}`);
const rows = await response.json();
const row = rows?.[0] || null;
const lastRun = row?.last_run_at ? new Date(row.last_run_at) : null;
const ageMinutes = lastRun && !Number.isNaN(lastRun.getTime())
  ? (Date.now() - lastRun.getTime()) / 60000
  : Number.POSITIVE_INFINITY;
const stale = !lastRun || ageMinutes > maxAgeMinutes;

console.log(JSON.stringify({ stale, ageMinutes, maxAgeMinutes, row }, null, 2));
if (process.env.GITHUB_OUTPUT) {
  const fs = await import("node:fs/promises");
  await fs.appendFile(process.env.GITHUB_OUTPUT, `stale=${stale ? "true" : "false"}\n`);
  await fs.appendFile(process.env.GITHUB_OUTPUT, `age_minutes=${Number.isFinite(ageMinutes) ? ageMinutes.toFixed(1) : "unknown"}\n`);
}
