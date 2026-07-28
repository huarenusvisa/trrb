#!/usr/bin/env node
import process from "node:process";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`缺少环境变量：${name}`);
}

const maxAgeMinutes = Number(process.env.ICE_WATCHDOG_MAX_AGE_MINUTES || 55);
const base = String(process.env.SUPABASE_URL).replace(/\/+$/, "");

async function readHeartbeat(queryKey) {
  const url = new URL(`${base}/rest/v1/ice_query_state`);
  url.searchParams.set("select", "query_key,last_run_at,last_success_at,last_error");
  url.searchParams.set("query_key", `eq.${queryKey}`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!response.ok) throw new Error(`读取ICE心跳失败：${response.status} ${await response.text()}`);
  const rows = await response.json();
  return rows?.[0] || null;
}

// Unified pipeline writes these real keys:
//   pipeline:parallel-collection-start (start)
//   pipeline:parallel-pipeline       (success/failure completion)
// Older watchdog code queried pipeline:unified-pipeline, a key that is never written.
const [completed, started] = await Promise.all([
  readHeartbeat("pipeline:parallel-pipeline"),
  readHeartbeat("pipeline:parallel-collection-start")
]);

const candidates = [
  completed?.last_success_at,
  completed?.last_run_at,
  started?.last_run_at
]
  .filter(Boolean)
  .map((value) => new Date(value))
  .filter((value) => !Number.isNaN(value.getTime()));

const latest = candidates.length
  ? new Date(Math.max(...candidates.map((value) => value.getTime())))
  : null;
const ageMinutes = latest ? (Date.now() - latest.getTime()) / 60000 : Number.POSITIVE_INFINITY;
const stale = !latest || ageMinutes > maxAgeMinutes;

console.log(JSON.stringify({
  stale,
  ageMinutes,
  maxAgeMinutes,
  latestHeartbeat: latest?.toISOString() || null,
  completed,
  started
}, null, 2));

if (process.env.GITHUB_OUTPUT) {
  const fs = await import("node:fs/promises");
  await fs.appendFile(process.env.GITHUB_OUTPUT, `stale=${stale ? "true" : "false"}\n`);
  await fs.appendFile(process.env.GITHUB_OUTPUT, `age_minutes=${Number.isFinite(ageMinutes) ? ageMinutes.toFixed(1) : "unknown"}\n`);
  await fs.appendFile(process.env.GITHUB_OUTPUT, `heartbeat_key=${completed ? "pipeline:parallel-pipeline" : started ? "pipeline:parallel-collection-start" : "missing"}\n`);
}
