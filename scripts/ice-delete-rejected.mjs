#!/usr/bin/env node
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const RETENTION_HOURS = Math.max(1, Number(process.env.ICE_REJECTED_RETENTION_HOURS || 1));
const BATCH_SIZE = Math.min(200, Math.max(10, Number(process.env.ICE_REJECTED_DELETE_BATCH_SIZE || 100)));
const MAX_BATCHES = Math.min(100, Math.max(1, Number(process.env.ICE_REJECTED_DELETE_MAX_BATCHES || 50)));

function requireEnv() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少 GitHub Secret：${missing.join(", ")}`);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function headers(prefer = "") {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await readJson(response);
  if (!response.ok) throw new Error(body?.message || body?.details || body?.error || body?.raw || String(response.status));
  return body;
}

async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return request(url, {
    method,
    headers: headers(prefer),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function inFilter(values) {
  return `in.(${values.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(",")})`;
}

async function deleteBatch(cutoff) {
  const rows = await sb("ice_stories", {
    query: {
      select: "id,status,article_id,updated_at",
      status: "in.(rejected,failed)",
      article_id: "is.null",
      updated_at: `lt.${cutoff}`,
      order: "updated_at.asc",
      limit: String(BATCH_SIZE)
    }
  });
  const stories = Array.isArray(rows) ? rows : [];
  if (!stories.length) return null;

  const storyIds = stories.map((story) => story.id);
  const evidence = await sb("ice_story_evidence", {
    query: {
      select: "id,story_id,post_id",
      story_id: inFilter(storyIds),
      limit: String(Math.max(BATCH_SIZE * 20, 2000))
    }
  });
  const evidenceRows = Array.isArray(evidence) ? evidence : [];
  const postIds = [...new Set(evidenceRows.map((row) => row.post_id).filter(Boolean))];

  await sb("ice_stories", {
    method: "DELETE",
    query: {
      id: inFilter(storyIds),
      status: "in.(rejected,failed)",
      article_id: "is.null",
      updated_at: `lt.${cutoff}`
    },
    prefer: "return=minimal"
  });

  let deletedPosts = 0;
  if (postIds.length) {
    const remaining = await sb("ice_story_evidence", {
      query: {
        select: "post_id",
        post_id: inFilter(postIds),
        limit: String(Math.max(postIds.length * 3, 1000))
      }
    });
    const stillLinked = new Set((Array.isArray(remaining) ? remaining : []).map((row) => row.post_id));
    const orphanIds = postIds.filter((id) => !stillLinked.has(id));
    if (orphanIds.length) {
      await sb("ice_posts", {
        method: "DELETE",
        query: { id: inFilter(orphanIds) },
        prefer: "return=minimal"
      });
      deletedPosts = orphanIds.length;
    }
  }

  return {
    stories: storyIds.length,
    evidence: evidenceRows.length,
    posts: deletedPosts
  };
}

async function main() {
  requireEnv();
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 3600000).toISOString();
  const totals = { stories: 0, evidence: 0, posts: 0, batches: 0 };

  for (let index = 0; index < MAX_BATCHES; index += 1) {
    const result = await deleteBatch(cutoff);
    if (!result) break;
    totals.batches += 1;
    totals.stories += result.stories;
    totals.evidence += result.evidence;
    totals.posts += result.posts;
    if (result.stories < BATCH_SIZE) break;
  }

  console.log(JSON.stringify({
    stage: "ice-delete-rejected-v1",
    cutoff,
    retention_hours: RETENTION_HOURS,
    ...totals
  }));
}

main().catch((error) => {
  console.error("清理已拒绝或失败的ICE候选记录失败：", error);
  process.exitCode = 1;
});
