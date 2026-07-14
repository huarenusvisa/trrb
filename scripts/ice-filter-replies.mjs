#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const FILTER_REASON = "filtered_x_reply_or_comment";

function safeText(value, max = 30000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function safeJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value || "")); } catch { return fallback; }
}

function nowIso() {
  return new Date().toISOString();
}

function requireEnvironment() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(body?.message || body?.details || body?.error || body?.raw || `${response.status}`);
  }
  return body;
}

function headers(prefer = "") {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return request(url, {
    method,
    headers: headers(prefer),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function referencedReply(tweet) {
  return (Array.isArray(tweet?.referenced_tweets) ? tweet.referenced_tweets : [])
    .some((item) => item?.type === "replied_to");
}

function startsAsReply(text) {
  return /^\s*@(?:[A-Za-z0-9_]{1,15})(?:\s+@(?:[A-Za-z0-9_]{1,15}))*\s+/u.test(String(text || ""));
}

function isReplyOrComment(post) {
  const payload = safeJson(post?.raw_payload, {});
  const tweet = payload?.tweet || payload?.data || {};
  return Boolean(
    referencedReply(tweet) ||
    tweet?.in_reply_to_user_id ||
    startsAsReply(post?.source_text)
  );
}

async function candidatePosts() {
  const rows = await sb("ice_posts", {
    query: {
      select: "id,x_post_id,source_username,source_text,raw_payload,processing_status,event_fingerprint,created_at",
      processing_status: "in.(collected,processing,extracted,clustered,failed)",
      order: "created_at.desc",
      limit: "2000"
    }
  });
  return Array.isArray(rows) ? rows : [];
}

async function evidenceForPost(postId) {
  const rows = await sb("ice_story_evidence", {
    query: { select: "story_id,post_id", post_id: `eq.${postId}`, limit: "100" }
  });
  return Array.isArray(rows) ? rows : [];
}

async function deleteEvidence(postId) {
  await sb("ice_story_evidence", {
    method: "DELETE",
    query: { post_id: `eq.${postId}` },
    prefer: "return=minimal"
  });
}

async function markPostFiltered(post) {
  const payload = safeJson(post.raw_payload, {});
  await sb("ice_posts", {
    method: "PATCH",
    query: { id: `eq.${post.id}` },
    body: {
      relevant: false,
      processing_status: "irrelevant",
      last_error: FILTER_REASON,
      raw_payload: {
        ...payload,
        filtering: {
          reason: FILTER_REASON,
          filtered_at: nowIso()
        }
      }
    },
    prefer: "return=minimal"
  });
}

async function remainingEvidence(storyId) {
  const rows = await sb("ice_story_evidence", {
    query: { select: "post_id", story_id: `eq.${storyId}`, limit: "1" }
  });
  return Array.isArray(rows) ? rows.length : 0;
}

async function storyById(storyId) {
  const rows = await sb("ice_stories", {
    query: { select: "id,status,human_review_status,decision_reason,ai_payload", id: `eq.${storyId}`, limit: "1" }
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateAffectedStory(storyId) {
  const story = await storyById(storyId);
  if (!story || ["published", "approved"].includes(story.status)) return;
  const count = await remainingEvidence(storyId);
  const payload = safeJson(story.ai_payload, {});
  const reason = count
    ? "已移除X回复或评论，等待基于账号原创帖子重新生成"
    : "已过滤：该候选仅由X回复或评论构成，不属于账号自主发布内容";
  await sb("ice_stories", {
    method: "PATCH",
    query: { id: `eq.${storyId}` },
    body: {
      status: count ? "collecting" : "rejected",
      human_review_status: count ? "not_reviewed" : "rejected",
      scheduled_at: null,
      decision_reason: `${safeText(story.decision_reason, 1500)}；${reason}`.replace(/^；/, ""),
      ai_payload: {
        ...payload,
        filtered_reply_only: !count,
        reply_filter_applied_at: nowIso()
      },
      updated_at: nowIso()
    },
    prefer: "return=minimal"
  });
}

async function main() {
  requireEnvironment();
  const posts = await candidatePosts();
  const filtered = posts.filter(isReplyOrComment);
  const affectedStories = new Set();

  for (const post of filtered) {
    const evidence = await evidenceForPost(post.id);
    evidence.forEach((item) => affectedStories.add(item.story_id));
    await deleteEvidence(post.id);
    await markPostFiltered(post);
  }

  for (const storyId of affectedStories) await updateAffectedStory(storyId);

  console.log(JSON.stringify({
    stage: "ice-filter-replies-v1",
    scanned: posts.length,
    filtered: filtered.length,
    affected_stories: affectedStories.size
  }));
}

export { referencedReply, startsAsReply, isReplyOrComment };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("ICE回复评论过滤失败：", error);
    process.exitCode = 1;
  });
}
