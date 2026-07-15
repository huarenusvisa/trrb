#!/usr/bin/env node
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const EXPIRE_HOURS = Number(process.env.ICE_UNREVIEWED_EXPIRE_HOURS || 10);
const BATCH_SIZE = Number(process.env.ICE_EXPIRE_BATCH_SIZE || 500);

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
  if (!response.ok) throw new Error(body?.message || body?.details || body?.error || body?.raw || `${response.status}`);
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

async function main() {
  requireEnv();
  const cutoff = new Date(Date.now() - EXPIRE_HOURS * 3600000).toISOString();

  const stories = await sb("ice_stories", {
    query: {
      select: "id,status,human_review_status,created_at,first_seen_at,last_seen_at,article_id",
      status: "in.(collecting,pending_review,pending_corroboration)",
      article_id: "is.null",
      created_at: `lt.${cutoff}`,
      order: "created_at.asc",
      limit: String(BATCH_SIZE)
    }
  });

  const expired = (Array.isArray(stories) ? stories : []).filter((story) => {
    const human = String(story.human_review_status || "").toLowerCase();
    return !["approved", "published", "reviewed"].includes(human);
  });

  if (!expired.length) {
    console.log(JSON.stringify({ stage: "ice-expire-unreviewed-v1", cutoff, expired_stories: 0, deleted_evidence: 0, deleted_posts: 0 }));
    return;
  }

  const storyIds = expired.map((story) => story.id);
  const evidence = await sb("ice_story_evidence", {
    query: {
      select: "id,story_id,post_id",
      story_id: inFilter(storyIds),
      limit: String(Math.max(BATCH_SIZE * 10, 5000))
    }
  });
  const evidenceRows = Array.isArray(evidence) ? evidence : [];
  const postIds = [...new Set(evidenceRows.map((row) => row.post_id).filter(Boolean))];

  await sb("ice_story_evidence", {
    method: "DELETE",
    query: { story_id: inFilter(storyIds) },
    prefer: "return=minimal"
  });

  await sb("ice_stories", {
    method: "DELETE",
    query: { id: inFilter(storyIds) },
    prefer: "return=minimal"
  });

  let deletedPosts = 0;
  if (postIds.length) {
    const remaining = await sb("ice_story_evidence", {
      query: { select: "post_id", post_id: inFilter(postIds), limit: String(Math.max(postIds.length * 3, 1000)) }
    });
    const stillLinked = new Set((Array.isArray(remaining) ? remaining : []).map((row) => row.post_id));
    const orphanIds = postIds.filter((id) => !stillLinked.has(id));
    if (orphanIds.length) {
      await sb("ice_posts", {
        method: "DELETE",
        query: {
          id: inFilter(orphanIds),
          processing_status: "in.(collected,processing,extracted,clustered,failed)"
        },
        prefer: "return=minimal"
      });
      deletedPosts = orphanIds.length;
    }
  }

  console.log(JSON.stringify({
    stage: "ice-expire-unreviewed-v1",
    cutoff,
    expire_hours: EXPIRE_HOURS,
    expired_stories: storyIds.length,
    deleted_evidence: evidenceRows.length,
    deleted_posts: deletedPosts
  }));
}

main().catch((error) => {
  console.error("清理超时ICE候选失败：", error);
  process.exitCode = 1;
});
