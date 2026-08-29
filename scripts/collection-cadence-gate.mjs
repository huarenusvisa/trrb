#!/usr/bin/env node
import fs from "node:fs";

const base = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const pipeline = String(process.env.COLLECTION_PIPELINE || "").trim().toLowerCase();
const action = String(process.env.COLLECTION_CADENCE_ACTION || "claim").trim().toLowerCase();
const force = /^(1|true|yes)$/i.test(String(process.env.COLLECTION_FORCE || ""));
const cadenceMinutes = Math.max(30, Number(process.env.COLLECTION_CADENCE_MINUTES || 180));
const allowedPipelines = new Set(["ice", "china-hot", "trump-x"]);

if (!base || !serviceKey) throw new Error("Missing Supabase environment");
if (!allowedPipelines.has(pipeline)) throw new Error(`Unsupported collection pipeline: ${pipeline || "missing"}`);
if (!new Set(["claim", "success", "failure"]).has(action)) throw new Error(`Unsupported cadence action: ${action}`);

const queryKey = `pipeline:collection-cadence:${pipeline}`;
const now = new Date().toISOString();
const headers = (prefer = "") => ({
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
  ...(prefer ? { Prefer: prefer } : {})
});

async function readState() {
  const url = new URL(`${base}/rest/v1/ice_query_state`);
  url.searchParams.set("select", "query_key,last_run_at,last_success_at,last_error,updated_at");
  url.searchParams.set("query_key", `eq.${queryKey}`);
  url.searchParams.set("limit", "1");
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) throw new Error(`Cadence state query failed: ${response.status} ${await response.text()}`);
  return (await response.json())?.[0] || null;
}

async function writeState(values) {
  const url = new URL(`${base}/rest/v1/ice_query_state`);
  url.searchParams.set("on_conflict", "query_key");
  const response = await fetch(url, {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify({
      query_key: queryKey,
      query_text: `Shared three-hour collection cadence: ${pipeline}`,
      updated_at: now,
      ...values
    })
  });
  if (!response.ok) throw new Error(`Cadence state update failed: ${response.status} ${await response.text()}`);
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

if (action === "claim") {
  const state = await readState();
  const lastSuccess = state?.last_success_at || null;
  const lastSuccessMs = lastSuccess ? new Date(lastSuccess).getTime() : 0;
  const ageMinutes = lastSuccessMs ? (Date.now() - lastSuccessMs) / 60000 : Infinity;
  const due = force || !Number.isFinite(ageMinutes) || ageMinutes >= cadenceMinutes;
  output("due", due ? "true" : "false");
  output("age_minutes", Number.isFinite(ageMinutes) ? ageMinutes.toFixed(1) : "unknown");
  output("last_success_at", lastSuccess || "none");
  if (due) await writeState({ last_run_at: now, last_error: null });
  console.log(JSON.stringify({ pipeline, action, due, force, cadence_minutes: cadenceMinutes, age_minutes: Number.isFinite(ageMinutes) ? Number(ageMinutes.toFixed(1)) : null, last_success_at: lastSuccess }, null, 2));
} else if (action === "success") {
  await writeState({ last_run_at: now, last_success_at: now, last_error: null });
  console.log(JSON.stringify({ pipeline, action, at: now }));
} else {
  await writeState({ last_run_at: now, last_error: String(process.env.COLLECTION_CADENCE_ERROR || `${pipeline} collection failed`).slice(0, 1500) });
  console.log(JSON.stringify({ pipeline, action, at: now }));
}
