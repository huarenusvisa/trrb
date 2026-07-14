#!/usr/bin/env node
import crypto from "node:crypto";
import process from "node:process";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const MAX_PER_RUN = Number(process.env.ICE_FAST_INTAKE_MAX || 500);

function safeText(value, max = 30000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function safeJson(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value || "")); } catch { return fallback; }
}

function nowIso() { return new Date().toISOString(); }
function hash(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }

function requireEnv() {
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
  if (!response.ok) throw new Error(body?.message || body?.details || body?.error || body?.raw || `请求失败（${response.status}）`);
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

function isReply(post) {
  const payload = safeJson(post.raw_payload, {});
  const tweet = payload?.tweet || payload?.data || {};
  const references = Array.isArray(tweet?.referenced_tweets) ? tweet.referenced_tweets : [];
  return Boolean(
    references.some((item) => item?.type === "replied_to") ||
    tweet?.in_reply_to_user_id ||
    /^\s*@(?:[A-Za-z0-9_]{1,15})(?:\s+@(?:[A-Za-z0-9_]{1,15}))*\s+/u.test(post.source_text || "")
  );
}

function firstSentence(value, max = 100) {
  const clean = safeText(value, 5000).replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
  const first = clean.split(/(?<=[。！？.!?])\s*/)[0] || clean || "ICE候选新闻待人工筛选";
  const chars = Array.from(first);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : first;
}

function summary(value, max = 320) {
  const clean = safeText(value, 10000).replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
  const chars = Array.from(clean);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : clean;
}

function imageOf(post) {
  for (const item of Array.isArray(post.media) ? post.media : []) {
    if (item?.type === "photo" && item.url) return item.url;
    if (item?.preview_image_url) return item.preview_image_url;
    if (item?.url) return item.url;
  }
  return "";
}

async function pendingPosts() {
  const rows = await sb("ice_posts", {
    query: {
      select: "*",
      processing_status: "in.(collected,processing,extracted,failed)",
      relevant: "neq.false",
      order: "source_created_at.desc.nullslast,created_at.desc",
      limit: String(MAX_PER_RUN)
    }
  });
  return Array.isArray(rows) ? rows : [];
}

async function existingEvidence(postId) {
  const rows = await sb("ice_story_evidence", {
    query: { select: "story_id", post_id: `eq.${postId}`, limit: "1" }
  });
  return Array.isArray(rows) && rows.length > 0;
}

async function markReply(post) {
  await sb("ice_posts", {
    method: "PATCH",
    query: { id: `eq.${post.id}` },
    body: { relevant: false, processing_status: "irrelevant", last_error: "filtered_x_reply_or_comment" },
    prefer: "return=minimal"
  });
}

async function createCandidate(post) {
  const fingerprint = `fast-${hash(post.x_post_id || post.id).slice(0, 40)}`;
  const raw = safeText(post.source_text, 30000);
  const title = firstSentence(raw);
  const brief = summary(raw);
  const time = nowIso();
  const storyRows = await sb("ice_stories", {
    method: "POST",
    query: { on_conflict: "event_fingerprint" },
    body: {
      event_fingerprint: fingerprint,
      event_type: post.event_type || "other",
      title,
      summary: brief,
      content: raw || brief,
      cover_image: imageOf(post),
      first_seen_at: post.source_created_at || post.created_at || time,
      last_seen_at: post.source_created_at || post.created_at || time,
      independent_source_count: 1,
      official_source_count: post.source_type === "official" ? 1 : 0,
      media_source_count: post.source_type === "media" ? 1 : 0,
      organization_source_count: post.source_type === "organization" ? 1 : 0,
      individual_source_count: post.source_type === "individual" ? 1 : 0,
      total_score: Number(post.relevance_score || 0),
      ai_confidence: 0,
      conflict_detected: false,
      legal_risk: false,
      privacy_risk: false,
      fabrication_risk: false,
      decision_reason: "新抓取内容已完成轻量过滤，直接进入等待交叉信源，由工作人员筛选。",
      status: "pending_corroboration",
      human_review_status: "required",
      scheduled_at: null,
      ai_payload: {
        fast_intake: true,
        fast_intake_at: time,
        lead_source_post_id: post.x_post_id || "",
        source_username: post.source_username || "",
        translation_pending: true
      },
      created_at: time,
      updated_at: time
    },
    prefer: "resolution=ignore-duplicates,return=representation"
  });

  let story = Array.isArray(storyRows) ? storyRows[0] : null;
  if (!story) {
    const existing = await sb("ice_stories", {
      query: { select: "id,event_fingerprint", event_fingerprint: `eq.${fingerprint}`, limit: "1" }
    });
    story = Array.isArray(existing) ? existing[0] : null;
  }
  if (!story) throw new Error(`无法创建候选新闻：${post.x_post_id || post.id}`);

  await sb("ice_story_evidence", {
    method: "POST",
    query: { on_conflict: "story_id,post_id" },
    body: {
      story_id: story.id,
      post_id: post.id,
      source_registry_id: post.source_registry_id || null,
      independence_key: post.independence_key || post.source_username || String(post.id),
      source_type: post.source_type || "individual",
      trust_tier: Number(post.trust_tier || 4),
      x_post_id: post.x_post_id || "",
      x_url: post.x_url || ""
    },
    prefer: "resolution=ignore-duplicates,return=minimal"
  });

  await sb("ice_posts", {
    method: "PATCH",
    query: { id: `eq.${post.id}` },
    body: { event_fingerprint: fingerprint, processing_status: "clustered", last_error: null },
    prefer: "return=minimal"
  });
}

async function main() {
  requireEnv();
  const posts = await pendingPosts();
  let visible = 0;
  let replies = 0;
  let alreadyLinked = 0;
  let failed = 0;

  for (const post of posts) {
    try {
      if (isReply(post)) {
        await markReply(post);
        replies += 1;
        continue;
      }
      if (await existingEvidence(post.id)) {
        alreadyLinked += 1;
        continue;
      }
      await createCandidate(post);
      visible += 1;
    } catch (error) {
      failed += 1;
      console.error(`快速导入失败 ${post.x_post_id || post.id}:`, error.message || error);
    }
  }

  console.log(JSON.stringify({
    stage: "ice-fast-intake-v1",
    scanned: posts.length,
    visible_in_cross_source: visible,
    filtered_replies: replies,
    already_linked: alreadyLinked,
    failed
  }));
}

main().catch((error) => {
  console.error("ICE快速导入失败：", error);
  process.exitCode = 1;
});
