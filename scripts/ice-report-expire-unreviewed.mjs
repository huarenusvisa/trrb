#!/usr/bin/env node
import process from "node:process";

const RETENTION_HOURS = 12;
const PRIVATE_BUCKET = process.env.ICE_REPORT_PRIVATE_BUCKET || "ice-report-private";
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function requireEnvironment() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SERVICE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}

function cutoffIso() {
  return new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000).toISOString();
}

function encodePath(path) {
  return String(path || "").split("/").map(encodeURIComponent).join("/");
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return { raw: text }; }
}

async function serviceFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(options.headers || {})
    }
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(body?.message || body?.details || body?.error || body?.raw || `Supabase ${response.status}`);
  }
  return body;
}

async function rest(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return serviceFetch(`/rest/v1/${table}${url.search}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function staleReports() {
  const rows = await rest("ice_user_reports", {
    query: {
      select: "id,media,created_at,status,reviewed_at",
      status: "eq.draft",
      reviewed_at: "is.null",
      created_at: `lt.${cutoffIso()}`,
      order: "created_at.asc",
      limit: "500"
    }
  });
  return Array.isArray(rows) ? rows : [];
}

async function deletePrivateObject(path) {
  if (!path) return false;
  try {
    await serviceFetch(`/storage/v1/object/${encodeURIComponent(PRIVATE_BUCKET)}/${encodePath(path)}`, {
      method: "DELETE"
    });
    return true;
  } catch (error) {
    console.warn(`未能删除投稿私有素材 ${path}: ${error.message}`);
    return false;
  }
}

async function deleteReport(report) {
  const media = Array.isArray(report.media) ? report.media : [];
  let removedObjects = 0;

  for (const item of media) {
    if (await deletePrivateObject(item?.path)) removedObjects += 1;
  }

  await rest("ice_report_upload_tokens", {
    method: "DELETE",
    query: { report_id: `eq.${report.id}` },
    prefer: "return=minimal"
  });

  await rest("ice_user_reports", {
    method: "DELETE",
    query: {
      id: `eq.${report.id}`,
      status: "eq.draft",
      reviewed_at: "is.null",
      created_at: `lt.${cutoffIso()}`
    },
    prefer: "return=minimal"
  });

  return removedObjects;
}

async function main() {
  requireEnvironment();
  const reports = await staleReports();
  let deleted = 0;
  let removedObjects = 0;

  for (const report of reports) {
    removedObjects += await deleteReport(report);
    deleted += 1;
  }

  console.log(JSON.stringify({
    retention_hours: RETENTION_HOURS,
    cutoff: cutoffIso(),
    stale_reports_found: reports.length,
    reports_deleted: deleted,
    private_objects_deleted: removedObjects
  }, null, 2));
}

main().catch((error) => {
  console.error("ICE用户投稿12小时自动清理失败：", error);
  process.exitCode = 1;
});
