const crypto = require("node:crypto");
const { authenticateStaff, rest, safeText } = require("./_shared/supabase-admin");
const { buildPeopleCountMetadata } = require("./_shared/ice-people-count");

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

async function listStories() {
  const rows = await rest("ice_stories", {
    query: {
      select: [
        "id","event_fingerprint","event_type","title","summary","content","cover_image",
        "last_seen_at","independent_source_count","official_source_count","media_source_count",
        "organization_source_count","individual_source_count","total_score","ai_confidence",
        "conflict_detected","legal_risk","privacy_risk","fabrication_risk","decision_reason",
        "status","human_review_status","scheduled_at","article_id","published_at","reviewed_at",
        "reviewer_email","editor_notes","updated_at","ai_payload"
      ].join(","),
      status: "in.(pending_review,pending_corroboration,approved,published,rejected,failed)",
      order: "updated_at.desc",
      limit: "250"
    }
  });
  return Array.isArray(rows) ? rows : [];
}

async function getStory(id) {
  const rows = await rest("ice_stories", {
    query: { select: "*", id: `eq.${safeText(id, 80)}`, limit: "1" }
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
      query: { select: "*", x_post_id: `eq.${safeText(preferred, 100)}`, limit: "1" }
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
      action: "manual_publish_override",
      from_status: story.status,
      to_status: "published",
      notes: safeText(notes, 4000),
      changes: {
        article_id: articleId,
        manual_override: true,
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

async function existingArticle(platform, sourceId) {
  const rows = await rest("articles", {
    query: {
      select: "id",
      source_platform: `eq.${platform}`,
      source_post_id: `eq.${sourceId}`,
      limit: "1"
    }
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function chinese(value) { return /[\u3400-\u9fff]/u.test(String(value || "")); }
function bodyLength(value) { return Array.from(String(value || "").replace(/\s+/g, "")).length; }
function shingles(value) { const text = String(value || "").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, ""); const set = new Set(); for (let index = 0; index < text.length - 1; index += 1) set.add(text.slice(index, index + 2)); return set; }
function similarity(a, b) { const left = shingles(a), right = shingles(b); if (!left.size || !right.size) return 0; let common = 0; for (const token of left) if (right.has(token)) common += 1; return common / (left.size + right.size - common); }
function assertEditorialReady(story, title, content) {
  const payload = story.ai_payload && typeof story.ai_payload === "object" ? story.ai_payload : {};
  const min = Number(payload.target_min_chars || (Number(payload.source_character_count || 0) >= 300 ? 500 : 300));
  const max = Number(payload.target_max_chars || (min === 500 ? 800 : 360));
  const count = bodyLength(content);
  if (!chinese(title) || !chinese(content)) throw Object.assign(new Error("标题和正文必须是中文，禁止直接发布英文原文"), { statusCode: 400 });
  if (count < min || count > max) throw Object.assign(new Error(`正文当前${count}字，必须达到${min}-${max}字后才能发布`), { statusCode: 400 });
  if (payload.old_news_checked !== true) throw Object.assign(new Error("尚未完成旧闻核验，不能发布"), { statusCode: 400 });
  if (payload.appears_old_news === true) throw Object.assign(new Error("系统识别为旧闻，不能发布"), { statusCode: 400 });
  if (Number(payload.image_count || 0) > 0 && payload.image_grounding_used !== true) throw Object.assign(new Error("原帖含图片但尚未完成读图核验，不能发布"), { statusCode: 400 });
}
async function recentSimilarArticle(title, summary, content) {
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const rows = await rest("articles", { query: { select: "id,title,summary,content", topic_key: "eq.ice", status: "eq.published", published_at: `gte.${cutoff}`, order: "published_at.desc", limit: "1000" } });
  const source = `${title}${summary}${content}`;
  return (Array.isArray(rows) ? rows : []).find((article) => similarity(source, `${article.title || ""}${article.summary || ""}${article.content || ""}`) >= 0.72) || null;
}

async function patchPublishedArticle(articleId, fields) {
  await rest("articles", {
    method: "PATCH",
    query: { id: `eq.${articleId}` },
    body: {
      title: fields.title,
      summary: fields.summary,
      content: fields.content,
      cover_image: fields.coverImage,
      seo_title: fields.title,
      seo_description: fields.summary || fields.content.slice(0, 160),
      status: "published",
      updated_at: nowIso()
    },
    prefer: "return=minimal"
  });
}

async function updatePublishedArticle(story, actor, fields) {
  const time = nowIso();
  await patchPublishedArticle(story.article_id, fields);
  const updated = await patchStory(story.id, {
    title: fields.title,
    summary: fields.summary,
    content: fields.content,
    cover_image: fields.coverImage,
    final_title: fields.title,
    final_summary: fields.summary,
    final_content: fields.content,
    final_cover_image: fields.coverImage,
    status: "published",
    human_review_status: "approved",
    editor_notes: fields.notes,
    reviewed_by: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || "",
    reviewed_at: time
  });
  await logReview(story, actor, fields.notes, story.article_id);
  return { story: updated, article_id: story.article_id, already_published: true, editorial_persisted: true };
}

async function publishNow(story, actor, input) {
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
  assertEditorialReady(story, title, content);

  if (story.article_id) return updatePublishedArticle(story, actor, { title, summary, content, coverImage, notes });

  const post = await leadPost(story);
  const eventType = story.event_type || post?.event_type || "other";
  const peopleMetadata = buildPeopleCountMetadata({ title, summary, content, event_type: eventType });
  const sourcePlatform = post ? "x" : "manual_ice_review";
  const sourceId = safeText(post?.x_post_id || story.id, 200);
  const duplicate = await existingArticle(sourcePlatform, sourceId);
  const similar = duplicate ? null : await recentSimilarArticle(title, summary, content);
  if (similar) throw Object.assign(new Error(`与近30天已发布ICE文章重复，已阻止发布（${similar.id}）`), { statusCode: 409 });
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
        summary,
        content,
        category_name: "ICE执法动态",
        cover_image: coverImage,
        seo_keywords: "ICE,移民执法,拘留,遣返,美国移民",
        author: "唐人日报编辑部",
        status: "published",
        published_at: time,
        created_at: time,
        topic_key: "ice",
        source_platform: sourcePlatform,
        source_post_id: sourceId,
        source_url: post?.x_url || "https://trrb.net/ice",
        source_account: post?.source_username || "ICE人工审核",
        source_created_at: post?.source_created_at || story.last_seen_at || time,
        ai_confidence: story.ai_confidence,
        review_status: "human_published_override",
        metadata: {
          event_fingerprint: story.event_fingerprint,
          event_type: eventType,
          city: story.ai_payload?.city || post?.city || "",
          state_code: story.ai_payload?.state_code || post?.state_code || "",
          location_text: story.ai_payload?.location_text || post?.location_text || "",
          ...peopleMetadata,
          source_language: story.ai_payload?.source_language || "unknown",
          manual_override: true,
          total_score: story.total_score,
          independent_source_count: story.independent_source_count,
          official_source_count: story.official_source_count,
          media_source_count: story.media_source_count,
          organization_source_count: story.organization_source_count,
          decision_reason: story.decision_reason,
          reviewer_email: actor.user.email || actor.admin.email || "",
          reviewed_at: time,
          editor_notes: notes,
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
  } else {
    await patchPublishedArticle(articleId, { title, summary, content, coverImage });
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
  return { story: updated, article_id: articleId, already_published: Boolean(duplicate), editorial_persisted: true };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const actor = await authenticateStaff(event, ["owner", "editor"]);
    const input = JSON.parse(event.body || "{}");
    const action = safeText(input.action, 60);

    if (action === "list") return json(200, { stories: await listStories() });
    if (action === "publish_now") {
      const story = await getStory(input.story_id);
      return json(200, await publishNow(story, actor, input));
    }
    return json(400, { error: "V2接口只处理增强列表和人工立即发布" });
  } catch (error) {
    console.error("ICE review v2 error:", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};
