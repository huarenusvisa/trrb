const crypto = require("node:crypto");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "https://fwiznbpsqkfgkvyznebz.supabase.co").replace(/\/+$/, "");
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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

function safeText(value, max = 20000) {
  return String(value ?? "").trim().replace(/\u0000/g, "").slice(0, max);
}

function nowIso() {
  return new Date().toISOString();
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function rest(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  if (!SERVICE_KEY) throw new Error("Netlify尚未设置SUPABASE_SERVICE_ROLE_KEY");
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.message || data?.details || data?.error || data?.raw || `Supabase ${response.status}`);
  }
  return data;
}

async function authenticate(event) {
  const token = safeText(event.headers.authorization || event.headers.Authorization, 1000).replace(/^Bearer\s+/i, "");
  if (!token) {
    const error = new Error("缺少后台登录凭证");
    error.statusCode = 401;
    throw error;
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` }
  });
  const user = await readJson(response);
  if (!response.ok || !user?.id) {
    const error = new Error("后台登录状态无效，请重新登录");
    error.statusCode = 401;
    throw error;
  }

  let rows = await rest("admin_users", {
    query: { select: "id,user_id,email,role,is_active", user_id: `eq.${user.id}`, is_active: "eq.true", limit: "1" }
  });
  let admin = Array.isArray(rows) ? rows[0] : null;
  if (!admin && user.email) {
    rows = await rest("admin_users", {
      query: { select: "id,user_id,email,role,is_active", email: `ilike.${safeText(user.email, 300)}`, is_active: "eq.true", limit: "1" }
    });
    admin = Array.isArray(rows) ? rows[0] : null;
  }

  if (!admin || !["owner", "admin"].includes(String(admin.role || "").toLowerCase())) {
    const error = new Error("这个账号没有ICE审核权限");
    error.statusCode = 403;
    throw error;
  }
  return { user, admin };
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

  if (story.article_id) return { article_id: story.article_id, already_published: true };

  const post = await leadPost(story);
  const sourcePlatform = post ? "x" : "manual_ice_review";
  const sourceId = safeText(post?.x_post_id || story.id, 200);
  const duplicate = await existingArticle(sourcePlatform, sourceId);
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
        category_name: "移民美国",
        cover_image: coverImage,
        seo_keywords: "ICE,移民执法,拘留,遣返,美国移民",
        author: "唐人日报编辑部",
        status: "published",
        published_at: time,
        created_at: time,
        topic_key: "ice",
        source_platform: sourcePlatform,
        source_post_id: sourceId,
        source_url: post?.x_url || "https://trrb.net/topic/ice/",
        source_account: post?.source_username || "ICE人工审核",
        source_created_at: post?.source_created_at || story.last_seen_at || time,
        ai_confidence: story.ai_confidence,
        review_status: "human_published_override",
        metadata: {
          event_fingerprint: story.event_fingerprint,
          event_type: story.event_type || post?.event_type || "other",
          city: story.ai_payload?.city || post?.city || "",
          state_code: story.ai_payload?.state_code || post?.state_code || "",
          location_text: story.ai_payload?.location_text || post?.location_text || "",
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
    const actor = await authenticate(event);
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
