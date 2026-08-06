#!/usr/bin/env node
import fs from 'node:fs';

const base = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const dueMinutes = Math.max(20, Number(process.env.ICE_RUN_DUE_MINUTES || 25));
if (!base || !key) throw new Error('Missing Supabase environment');

const url = new URL(`${base}/rest/v1/ice_query_state`);
url.searchParams.set('select', 'query_key,last_success_at,last_run_at,updated_at');
url.searchParams.set('query_key', 'eq.pipeline:parallel-pipeline');
url.searchParams.set('limit', '1');

const response = await fetch(url, {
  headers: { apikey: key, Authorization: `Bearer ${key}` }
});
if (!response.ok) throw new Error(`Heartbeat query failed: ${response.status} ${await response.text()}`);
const rows = await response.json();
const row = rows?.[0] || null;
const raw = row?.last_success_at || row?.last_run_at || row?.updated_at || null;
const lastMs = raw ? new Date(raw).getTime() : 0;
const ageMinutes = lastMs ? (Date.now() - lastMs) / 60000 : Infinity;
const due = !Number.isFinite(ageMinutes) || ageMinutes >= dueMinutes;

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `due=${due ? 'true' : 'false'}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `age_minutes=${Number.isFinite(ageMinutes) ? ageMinutes.toFixed(1) : 'unknown'}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `last_success_at=${raw || 'none'}\n`);
}

console.log(JSON.stringify({
  due,
  due_after_minutes: dueMinutes,
  age_minutes: Number.isFinite(ageMinutes) ? Number(ageMinutes.toFixed(1)) : null,
  last_success_at: raw
}, null, 2));

// ICE生产恢复触发：2026-08-06。主工作流把非零退出码解释为“需要完整运行”。
// Previously this script always exited 0, so every scheduled run was incorrectly skipped.
if (due) process.exitCode = 1;
