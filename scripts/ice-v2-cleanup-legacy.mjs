#!/usr/bin/env node
import process from "node:process";
import { loadPolicy } from "./ice-v2-source-policy.mjs";
import { cleanupDecision, cleanupPatch, summarizeCleanup } from "./ice-v2-cleanup-core.mjs";

const APPLY = process.argv.includes("--apply");
const LIMIT = Math.max(1, Math.min(5000, Number(process.env.ICE_V2_CLEANUP_LIMIT || 1000)));
const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${process.env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await readJson(response);
  if (!response.ok) throw new Error(result?.message || result?.details || result?.error || result?.raw || `${response.status}`);
  return result;
}

async function loadRows() {
  const rows = await sb("ice_posts", {
    query: {
      select: "id,source_username,source_type,raw_payload,processing_status,relevant,last_error",
      processing_status: "neq.irrelevant",
      order: "created_at.asc",
      limit: String(LIMIT)
    }
  });
  return Array.isArray(rows) ? rows : [];
}

async function applyExclusion(row, reason) {
  await sb("ice_posts", {
    method: "PATCH",
    query: { id: `eq.${row.id}` },
    body: cleanupPatch(reason),
    prefer: "return=minimal"
  });
}

async function main() {
  requireEnv();
  const policy = await loadPolicy();
  const rows = await loadRows();
  const summary = summarizeCleanup(rows, policy);
  const exclusions = [];

  for (const row of rows) {
    const decision = cleanupDecision(policy, row);
    if (decision.action !== "exclude") continue;
    exclusions.push({ id: row.id, source_username: row.source_username || "", source_type: row.source_type || "", reason: decision.reason });
    if (APPLY) await applyExclusion(row, decision.reason);
  }

  console.log(JSON.stringify({
    stage: "ice-v2-cleanup-legacy",
    mode: APPLY ? "apply" : "dry-run",
    ...summary,
    sample_exclusions: exclusions.slice(0, 50)
  }, null, 2));
}

main().catch((error) => {
  console.error("ICE v2 legacy cleanup failed:", error);
  process.exitCode = 1;
});
