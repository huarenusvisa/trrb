#!/usr/bin/env node
import process from "node:process";
import fs from "node:fs";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const STALE_MINUTES = Math.max(35, Number(process.env.ICE_WATCHDOG_STALE_MINUTES || 45));

function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}

function headers() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
}

function writeOutput(key, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${String(value)}\n`);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function main() {
  requireEnv();
  const base = String(process.env.SUPABASE_URL).replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/ice_query_state`);
  url.searchParams.set("select", "query_key,last_run_at,last_success_at,last_error,updated_at");
  url.searchParams.set("query_key", "eq.pipeline:parallel-collection-start");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, { headers: headers() });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload?.message || payload?.raw || `读取ICE心跳失败：${response.status}`);

  const row = Array.isArray(payload) ? payload[0] : null;
  const lastRunMs = row?.last_run_at ? new Date(row.last_run_at).getTime() : 0;
  const ageMinutes = lastRunMs ? (Date.now() - lastRunMs) / 60000 : Infinity;
  const needDispatch = !Number.isFinite(ageMinutes) || ageMinutes > STALE_MINUTES;

  writeOutput("need_dispatch", needDispatch ? "true" : "false");
  writeOutput("age_minutes", Number.isFinite(ageMinutes) ? ageMinutes.toFixed(1) : "unknown");
  writeOutput("last_run_at", row?.last_run_at || "none");

  console.log(JSON.stringify({
    watchdog: "ice-schedule",
    stale_after_minutes: STALE_MINUTES,
    last_run_at: row?.last_run_at || null,
    age_minutes: Number.isFinite(ageMinutes) ? Number(ageMinutes.toFixed(1)) : null,
    need_dispatch: needDispatch
  }, null, 2));
}

main().catch((error) => {
  console.error("ICE调度看门狗检查失败：", error);
  writeOutput("need_dispatch", "true");
  writeOutput("age_minutes", "check_failed");
  process.exitCode = 1;
});
