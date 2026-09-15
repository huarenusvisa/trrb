#!/usr/bin/env node
import process from "node:process";
import { findRenEventDuplicate } from "./ren-zhengfei-event-dedupe.mjs";

const BASE = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");

async function rest(table, { method = "GET", query = {}, prefer = "" } = {}) {
  const url = new URL(`${BASE}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, String(value));
  const response = await fetch(url, { method, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) } });
  const raw = await response.text();
  let data = null; try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
  if (!response.ok) throw new Error(data?.message || data?.details || data?.raw || `Supabase ${response.status}`);
  return data;
}

async function main() {
  if (!BASE || !KEY) throw new Error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  const rows = await rest("articles", { query: {
    select: "id,title,summary,published_at,source_created_at,metadata,automation_source",
    topic_key: "eq.ren-zhengfei", status: "eq.published", visibility: "eq.public",
    order: "source_created_at.asc.nullslast,published_at.asc", limit: "1000",
  } });
  const kept = []; const removed = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    // Only automatic X ingestion is cleaned. Hand-written/static topic stories remain untouched.
    if (row.automation_source !== "china-hot-li-teacher-v2") { kept.push(row); continue; }
    const duplicate = findRenEventDuplicate(row, kept);
    if (!duplicate) { kept.push(row); continue; }
    await rest("articles", { method: "DELETE", query: { id: `eq.${row.id}` }, prefer: "return=minimal" });
    removed.push({ id: row.id, title: row.title, kept_id: duplicate.id });
  }
  console.log(JSON.stringify({ stage: "ren-zhengfei-clean-published-duplicates-v1", scanned: Array.isArray(rows) ? rows.length : 0, removed: removed.length, retained: kept.length, duplicates: removed }, null, 2));
}

main().catch((error) => { console.error("任正非时间线重复清理失败：", error); process.exitCode = 1; });
