const crypto = require("node:crypto");
const {
  safeText,
  rest,
  authenticateAdmin
} = require("./_shared/supabase-admin");

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
    const error = new Error("没有找到这条ICE候选新闻");
    error.statusCode = 404;
    throw error;
  }
  return story;
}

async function leadPost(story) {
  const preferred = story.ai_payload?.lead_source_post_id;
  if (preferred) {
    const rows = await rest("ice_posts", {
      query: { select: "*", x_post_id: `eq.${safeText(preferred, 120)}`, limit: "1" }
    });
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }
  const rows = await rest("ice_posts", {
    query: {
      select: "*",
      event_fingerprint: `eq.${story.event_fingerprint}`,
      order: "trust_tier.asc,source_created_at.asc",
      limit: "1"
    }
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function evidenceFor(storyId) {
  const rows = await rest("ice_story_evidence", {
    query: { select: "*", story_id: `eq.${storyId}`, order: "created_at.asc", limit: "100" }
  });
  return Array.isArray(rows) ? rows : [];
}

async function existingArticle(postId, fingerprint) {
  if (postId) {
    const bySource = await rest("articles", {
      query: { select: "id", source_platform: "eq.x", source_post_id: `eq.${postId}`, limit: "1" }
    });
    if (Array.isArray(bySource) && bySource[0]) return bySource[0];
  }
  const byEvent = await rest("articles", {
    query: { select: "id", slug: `eq.ice-${fingerprint}`, limit: "1" }
  });
  return Array.isArray(byEvent) ? byEvent[0] || null : null;
}

async function patchStory(id, patch) {
  const rows = await rest("ice_stories", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: { ...patch, updated_at: nowIso() },
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function logReview(story, actor, notes, articleId) {
  await rest("ice_review_logs", {
    method: "POST",
    body: {
      story_id: story.id,
      reviewer_user_id: actor.user.id,
      reviewer_email: actor.user.email || actor.admin.email || "",
      action: "staff_publish_decision",
      from_status: story.status,
      to_status: "published",
      notes: safeText(notes, 4000),
      changes: {
        article_id: articleId,
        staff_override: true,
        image_optional: true,
        risk_flags: {
          conflict_detected: Boolean(story.conflict_detected),
          legal_risk: Boolean(story.legal_risk),
          privacy_risk: Boolean(story.privacy_risk),
          fabrication_risk: Boolean(story.fabrication_risk)
        }
      }
    },
    prefer: "return=minimal"
  });
}

async function publish(story, actor, input) {
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
  if (story.article_id) return { article_id: story.article_id, already_published: true };

  const post = await leadPost(story);
  const sourceId = safeText(post?.x_post_id || story.id, 200);
  const duplicate = await existingArticle(sourceId, story.event_fingerprint || story.id);
  const evidence = await evidenceFor(story.id);
  const time = nowIso();
  let articleId = duplicate?.id || null;

  if (!articleId) {
    articleId = crypto.randomUUID();
    const rows = await rest("articles", {
      method: "POST",
      body: {
        id: articleId,
        title,
        slug: `ice-${story.event_fingerprint || story.id}`,
        summary: summary || content.slice(0, 260),
        content,
        category_name: "驱逐快报",
        cover_image: coverImage,
        seo_keywords: "ICE,移民执法,拘留,遣返,驱逐快报,美国移民",
        author: "唐人日报编辑部",
        status: "published",
        published_at: time,
        created_at: time,
        topic_key: "ice",
        source_platform: post ? "x" : "manual_ice_review",
        source_post_id: sourceId,
        source_url: post?.x_url || "https://trrb.net/topic/ice/",
        source_account: post?.source_username || "ICE人工审核",
        source_created_at: post?.source_created_at || story.last_seen_at || time,
        ai_confidence: story.ai_confidence,
        review_status: "staff_published",
        metadata: {
          event_fingerprint: story.event_fingerprint,
          staff_publish_decision: true,
          image_optional: true,
          reviewer_email: actor.user.email || actor.admin.email || "",
          reviewed_at: time,
          editor_notes: notes,
          risk_flags: {
            conflict_detected: Boolean(story.conflict_detected),
            legal_risk: Boolean(story.legal_risk),
            privacy_risk: Boolean(story.privacy_risk),
            fabrication_risk: Boolean(story.fabrication_risk)
          },
          evidence: evidence.map((item) => ({
            post_id: item.x_post_id,
            url: item.x_url,
            source_type: item.source_type,
            independence_key: item.independence_key
          }))
        }
      },
      prefer: "return=representation"
    });
    const article = Array.isArray(rows) ? rows[0] : rows;
    articleId = String(article?.id || articleId);
  }

  const updated = await patchStory(story.id, {
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
    published_at: time,
    scheduled_at: null,
    editor_notes: notes,
    reviewed_by: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || "",
    reviewed_at: time
  });
  await logReview(story, actor, notes, articleId);
  return { story: updated, article_id: articleId, already_published: Boolean(duplicate) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const actor = await authenticateAdmin(event);
    const input = JSON.parse(event.body || "{}");
    if (safeText(input.action, 60) !== "publish_now") return json(400, { error: "只支持publish_now操作" });
    return json(200, await publish(await getStory(input.story_id), actor, input));
  } catch (error) {
    console.error("ICE staff publish v3 error:", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};
