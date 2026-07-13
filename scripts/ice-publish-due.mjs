#!/usr/bin/env node
import crypto from "node:crypto";
import process from "node:process";

function intEnv(name, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}
function nowIso() { return new Date().toISOString(); }
function safeJson(value, fallback = null) {
  try { return typeof value === "string" ? JSON.parse(value) : value; }
  catch { return fallback; }
}
async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? safeJson(text, { raw: text }) : null;
  if (!response.ok) {
    throw new Error(
      `${options.method || "GET"} ${url} → ${response.status}: ${
        body?.message || body?.detail || text.slice(0, 500)
      }`
    );
  }
  return body;
}
function requireEnvironment() {
  const missing = ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"]
    .filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}
function headers(prefer = "") {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const base = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  return requestJson(url, {
    method,
    headers: headers(prefer),
    body: body == null ? undefined : JSON.stringify(body),
  });
}

async function dueStories(limit) {
  const rows = await sb("ice_stories", {
    query: {
      select: "*",
      status: "eq.approved",
      scheduled_at: `lte.${nowIso()}`,
      order: "scheduled_at.asc",
      limit: String(limit),
    },
  });
  return Array.isArray(rows) ? rows : [];
}
async function storyEvidence(storyId) {
  const rows = await sb("ice_story_evidence", {
    query: {
      select: "*",
      story_id: `eq.${storyId}`,
      order: "created_at.asc",
      limit: "100",
    },
  });
  return Array.isArray(rows) ? rows : [];
}
async function leadPost(story) {
  const preferred = story.ai_payload?.lead_source_post_id;
  if (preferred) {
    const rows = await sb("ice_posts", {
      query: { select: "*", x_post_id: `eq.${preferred}`, limit: "1" },
    });
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  const rows = await sb("ice_posts", {
    query: {
      select: "*",
      event_fingerprint: `eq.${story.event_fingerprint}`,
      order: "trust_tier.asc,source_created_at.asc",
      limit: "1",
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function existingArticle(postId) {
  const rows = await sb("articles", {
    query: {
      select: "id",
      source_platform: "eq.x",
      source_post_id: `eq.${postId}`,
      limit: "1",
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}
async function updateStory(id, patch) {
  await sb("ice_stories", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: patch,
    prefer: "return=minimal",
  });
}

async function publish(story) {
  const threshold = intEnv("ICE_AUTO_PUBLISH_SCORE", 80, 0, 100);
  if (
    Number(story.total_score || 0) < threshold ||
    story.conflict_detected ||
    story.legal_risk ||
    story.privacy_risk ||
    story.fabrication_risk
  ) {
    await updateStory(story.id, {
      status: "pending_review",
      decision_reason: `${story.decision_reason || ""}；规律发布器二次拦截`,
    });
    return null;
  }

  const post = await leadPost(story);
  if (!post) throw new Error(`故事${story.id}没有来源帖子`);

  const duplicate = await existingArticle(post.x_post_id);
  if (duplicate) {
    await updateStory(story.id, {
      status: "published",
      article_id: String(duplicate.id),
      published_at: nowIso(),
    });
    return duplicate.id;
  }

  const evidence = await storyEvidence(story.id);
  const id = crypto.randomUUID();
  const time = nowIso();
  const rows = await sb("articles", {
    method: "POST",
    body: {
      id,
      title: story.title,
      slug: `ice-${story.event_fingerprint}`,
      summary: story.summary,
      content: story.content,
      category_name: "移民美国",
      cover_image: story.cover_image || "",
      seo_keywords: "ICE,移民执法,拘留,遣返,美国移民",
      author: "唐人日报编辑部",
      status: "published",
      published_at: time,
      created_at: time,
      topic_key: "ice",
      source_platform: "x",
      source_post_id: post.x_post_id,
      source_url: post.x_url,
      source_account: post.source_username,
      source_created_at: post.source_created_at,
      ai_confidence: story.ai_confidence,
      review_status: "cross_source_auto_published",
      metadata: {
        event_fingerprint: story.event_fingerprint,
        total_score: story.total_score,
        independent_source_count: story.independent_source_count,
        official_source_count: story.official_source_count,
        media_source_count: story.media_source_count,
        organization_source_count: story.organization_source_count,
        decision_reason: story.decision_reason,
        confirmed_facts: story.ai_payload?.confirmed_facts || [],
        unconfirmed_claims: story.ai_payload?.unconfirmed_claims || [],
        evidence: evidence.map((item) => ({
          post_id: item.x_post_id,
          url: item.x_url,
          source_type: item.source_type,
          independence_key: item.independence_key,
        })),
      },
    },
    prefer: "return=representation",
  });

  const article = Array.isArray(rows) ? rows[0] : rows;
  const finalId = String(article?.id || id);
  await updateStory(story.id, {
    status: "published",
    article_id: finalId,
    published_at: time,
  });
  return finalId;
}

async function main() {
  requireEnvironment();
  const max = intEnv("ICE_PUBLISH_MAX_PER_RUN", 1, 1, 3);
  const stories = await dueStories(max);
  if (!stories.length) {
    console.log("ICE规律发布器：没有到期内容");
    return;
  }

  let published = 0;
  for (const story of stories) {
    try {
      const id = await publish(story);
      if (id) {
        published += 1;
        console.log(`已发布：${story.title} → ${id}`);
      }
    } catch (error) {
      await updateStory(story.id, {
        status: "failed",
        decision_reason: `${story.decision_reason || ""}；发布失败：${String(error.message || error).slice(0, 500)}`,
      });
      console.error(`发布${story.id}失败：`, error.message);
    }
  }
  console.log(`ICE规律发布器完成：${published}条`);
}

main().catch((error) => {
  console.error("ICE规律发布器失败：", error);
  process.exitCode = 1;
});
