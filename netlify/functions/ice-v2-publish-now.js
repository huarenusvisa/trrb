const crypto = require("node:crypto");
const { rest, authenticateAdmin, safeText } = require("./_shared/supabase-admin");
const {
  publishableStory,
  publicationIdentity,
  normalizeEvidence
} = require("./_shared/ice-v2-publish");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(body)
  };
}

function nowIso() {
  return new Date().toISOString();
}

async function getStory(id) {
  const rows = await rest("ice_stories", {
    query: { select: "*", id: `eq.${safeText(id, 100)}`, limit: "1" }
  });
  const story = Array.isArray(rows) ? rows[0] : null;
  if (!story) {
    const error = new Error("没有找到这条ICE v2候选新闻");
    error.statusCode = 404;
    throw error;
  }
  return story;
}

async function getEvidence(storyId) {
  const rows = await rest("ice_story_evidence", {
    query: { select: "*", story_id: `eq.${storyId}`, order: "created_at.asc", limit: "200" }
  });
  return Array.isArray(rows) ? rows : [];
}

async function getLeadPost(story) {
  const rows = await rest("ice_posts", {
    query: {
      select: "*",
      event_fingerprint: `eq.${story.event_fingerprint}`,
      processing_status: "neq.irrelevant",
      order: "trust_tier.asc,source_created_at.asc",
      limit: "1"
    }
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function existingArticle(identity) {
  const rows = await rest("articles", {
    query: {
      select: "id,status,published_at",
      source_platform: `eq.${identity.source_platform}`,
      source_post_id: `eq.${identity.source_post_id}`,
      limit: "1"
    }
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function updateStory(id, patch) {
  const rows = await rest("ice_stories", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: { ...patch, updated_at: nowIso() },
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function writeReviewLog(story, actor, notes, articleId, alreadyPublished) {
  await rest("ice_review_logs", {
    method: "POST",
    body: {
      story_id: story.id,
      reviewer_user_id: actor.user.id,
      reviewer_email: actor.user.email || actor.admin.email || "",
      action: alreadyPublished ? "manual_publish_idempotent" : "manual_publish_override",
      from_status: story.status,
      to_status: "published",
      notes: safeText(notes, 4000),
      changes: {
        article_id: articleId,
        ice_v2: true,
        event_level_dedupe: true,
        already_published: Boolean(alreadyPublished)
      }
    },
    prefer: "return=minimal"
  });
}

async function publish(story, actor, input) {
  const guard = publishableStory(story);
  if (!guard.ok) {
    const error = new Error(guard.reason === "not_ice_v2_story" ? "这不是ICE v2事件，禁止通过v2发布器发布" : "当前事件状态不允许发布");
    error.statusCode = 400;
    throw error;
  }
  if (guard.already_published) {
    return { article_id: story.article_id, already_published: true, story };
  }

  const title = safeText(input.title || story.final_title || story.title, 220);
  const summary = safeText(input.summary || story.final_summary || story.summary, 1200);
  const content = safeText(input.content || story.final_content || story.content || summary, 30000);
  const coverImage = safeText(input.cover_image || story.final_cover_image || story.cover_image, 3000);
  const notes = safeText(input.notes, 4000);
  if (!title || !content) {
    const error = new Error("标题和正文不能为空");
    error.statusCode = 400;
    throw error;
  }

  const identity = publicationIdentity(story);
  const duplicate = await existingArticle(identity);
  const evidence = normalizeEvidence(await getEvidence(story.id));
  const leadPost = await getLeadPost(story);
  const time = nowIso();
  let articleId = duplicate?.id || null;

  if (!articleId) {
    articleId = crypto.randomUUID();
    const rows = await rest("articles", {
      method: "POST",
      body: {
        id: articleId,
        title,
        slug: identity.slug,
        summary,
        content,
        category_name: "移民美国",
        cover_image: coverImage,
        seo_keywords: "ICE,移民执法,拘留,遣返,美国移民",
        author: "唐人日报编辑部",
        status: "published",
        published_at: time,
        created_at: time,
        topic_key: "ice",
        source_platform: identity.source_platform,
        source_post_id: identity.source_post_id,
        source_url: leadPost?.x_url || "https://trrb.net/topic/ice/",
        source_account: leadPost?.source_username || "ICE v2事件",
        source_created_at: leadPost?.source_created_at || story.last_seen_at || time,
        ai_confidence: story.ai_confidence,
        review_status: "human_published_override",
        metadata: {
          ice_v2: true,
          event_fingerprint: story.event_fingerprint,
          event_type: story.event_type || leadPost?.event_type || "other",
          manual_override: true,
          event_level_dedupe: true,
          independent_source_count: story.independent_source_count,
          official_source_count: story.official_source_count,
          media_source_count: story.media_source_count,
          reviewer_email: actor.user.email || actor.admin.email || "",
          reviewed_at: time,
          editor_notes: notes,
          evidence
        }
      },
      prefer: "return=representation"
    });
    articleId = String((Array.isArray(rows) ? rows[0] : rows)?.id || articleId);
  }

  const updated = await updateStory(story.id, {
    title,
    summary,
    content,
    cover_image: coverImage,
    final_title: title,
    final_summary: summary,
    final_content: content,
    final_cover_image: coverImage,
    status: "published",
    human_review_status: "approved",
    article_id: String(articleId),
    published_at: duplicate?.published_at || time,
    scheduled_at: null,
    editor_notes: notes,
    reviewed_by: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || "",
    reviewed_at: time
  });

  await writeReviewLog(story, actor, notes, articleId, Boolean(duplicate));
  return { story: updated, article_id: articleId, already_published: Boolean(duplicate) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const actor = await authenticateAdmin(event);
    const input = JSON.parse(event.body || "{}");
    if (safeText(input.action, 40) !== "publish_now") return json(400, { error: "只支持publish_now操作" });
    const story = await getStory(input.story_id);
    return json(200, await publish(story, actor, input));
  } catch (error) {
    console.error("ICE v2 publish error:", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};
