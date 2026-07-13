const crypto = require("node:crypto");

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || "https://fwiznbpsqkfgkvyznebz.supabase.co"
).replace(/\/+$/, "");
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
    body: JSON.stringify(body),
  };
}

function safeText(value, max = 20000) {
  return String(value ?? "").trim().slice(0, max);
}

function nowIso() {
  return new Date().toISOString();
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function supabaseRest(table, {
  method = "GET",
  query = {},
  body,
  prefer = "",
} = {}) {
  if (!SERVICE_KEY) throw new Error("Netlify 尚未设置 SUPABASE_SERVICE_ROLE_KEY");

  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new Error(
      `${method} ${table} 失败（${res.status}）：${
        data?.message || data?.details || data?.raw || "未知错误"
      }`
    );
  }
  return data;
}

async function authenticate(event) {
  const token = String(
    event.headers.authorization || event.headers.Authorization || ""
  ).replace(/^Bearer\s+/i, "");
  if (!token) {
    const error = new Error("缺少后台登录凭证");
    error.statusCode = 401;
    throw error;
  }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  const user = await readJson(userRes);
  if (!userRes.ok || !user?.id) {
    const error = new Error("后台登录状态无效，请重新登录");
    error.statusCode = 401;
    throw error;
  }

  let rows = await supabaseRest("admin_users", {
    query: {
      select: "id,user_id,email,role,is_active",
      user_id: `eq.${user.id}`,
      is_active: "eq.true",
      limit: "1",
    },
  });

  let admin = Array.isArray(rows) ? rows[0] : null;
  if (!admin && user.email) {
    rows = await supabaseRest("admin_users", {
      query: {
        select: "id,user_id,email,role,is_active",
        email: `ilike.${String(user.email).trim()}`,
        is_active: "eq.true",
        limit: "1",
      },
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

async function getStory(id) {
  const rows = await supabaseRest("ice_stories", {
    query: { select: "*", id: `eq.${id}`, limit: "1" },
  });
  const story = Array.isArray(rows) ? rows[0] : null;
  if (!story) {
    const error = new Error("没有找到这条ICE候选新闻");
    error.statusCode = 404;
    throw error;
  }
  return story;
}

async function listStories() {
  const rows = await supabaseRest("ice_stories", {
    query: {
      select: [
        "id","event_fingerprint","event_type","title","summary","cover_image",
        "last_seen_at","independent_source_count","official_source_count",
        "media_source_count","organization_source_count","individual_source_count",
        "total_score","ai_confidence","conflict_detected","legal_risk",
        "privacy_risk","fabrication_risk","decision_reason","status",
        "human_review_status","scheduled_at","article_id","published_at",
        "reviewed_at","reviewer_email","editor_notes","updated_at"
      ].join(","),
      status: "in.(pending_review,pending_corroboration,approved,published,rejected,failed)",
      order: "updated_at.desc",
      limit: "250",
    },
  });
  return Array.isArray(rows) ? rows : [];
}

async function storyDetail(id) {
  const story = await getStory(id);
  const [evidence, posts, logs] = await Promise.all([
    supabaseRest("ice_story_evidence", {
      query: {
        select: "*",
        story_id: `eq.${id}`,
        order: "created_at.asc",
        limit: "100",
      },
    }),
    supabaseRest("ice_posts", {
      query: {
        select: [
          "id","x_post_id","x_url","source_username","source_display_name",
          "source_type","trust_tier","independence_key","source_created_at",
          "source_text","media","claims","entities","extraction_confidence",
          "extraction_payload"
        ].join(","),
        event_fingerprint: `eq.${story.event_fingerprint}`,
        order: "trust_tier.asc,source_created_at.asc",
        limit: "100",
      },
    }),
    supabaseRest("ice_review_logs", {
      query: {
        select: "*",
        story_id: `eq.${id}`,
        order: "created_at.desc",
        limit: "50",
      },
    }),
  ]);

  return {
    story,
    evidence: Array.isArray(evidence) ? evidence : [],
    posts: Array.isArray(posts) ? posts : [],
    logs: Array.isArray(logs) ? logs : [],
  };
}

function approvalEligibility(story) {
  const risks = [
    story.conflict_detected,
    story.legal_risk,
    story.privacy_risk,
    story.fabrication_risk,
  ].some(Boolean);

  const sourceEligible =
    Number(story.official_source_count || 0) >= 1 ||
    (
      Number(story.independent_source_count || 0) >= 2 &&
      (
        Number(story.media_source_count || 0) >= 1 ||
        Number(story.organization_source_count || 0) >= 1
      )
    );

  const scoreEligible =
    Number(story.total_score || 0) >= 80 &&
    Number(story.ai_confidence || 0) >= 80;

  if (risks) return { ok: false, reason: "存在事实冲突、法律、隐私或虚构风险" };
  if (!sourceEligible) return { ok: false, reason: "独立信源或专业信源不足" };
  if (!scoreEligible) return { ok: false, reason: "综合评分或AI可信度低于80分" };
  return { ok: true, reason: "符合人工批准条件" };
}

function roundToNextHalfHour(date) {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  const minutes = d.getUTCMinutes();
  if (minutes < 30) d.setUTCMinutes(30);
  else {
    d.setUTCHours(d.getUTCHours() + 1);
    d.setUTCMinutes(0);
  }
  return d;
}

async function defaultSchedule() {
  const rows = await supabaseRest("ice_stories", {
    query: {
      select: "scheduled_at",
      status: "eq.approved",
      scheduled_at: "not.is.null",
      order: "scheduled_at.desc",
      limit: "1",
    },
  });

  let candidate = new Date();
  const latest = Array.isArray(rows) ? rows[0] : null;
  if (latest?.scheduled_at) {
    const next = new Date(new Date(latest.scheduled_at).getTime() + 120 * 60 * 1000);
    if (next > candidate) candidate = next;
  }
  return roundToNextHalfHour(candidate).toISOString();
}

function editedFields(input, story) {
  const title = safeText(input.title || story.title, 220);
  const summary = safeText(input.summary || story.summary, 1200);
  const content = safeText(input.content || story.content, 30000);
  const coverImage = safeText(input.cover_image || story.cover_image, 3000);
  return { title, summary, content, coverImage };
}

async function logReview({ story, actor, action, toStatus, notes, changes }) {
  await supabaseRest("ice_review_logs", {
    method: "POST",
    body: {
      story_id: story.id,
      reviewer_user_id: actor.user.id,
      reviewer_email: actor.user.email || actor.admin.email || "",
      action,
      from_status: story.status,
      to_status: toStatus,
      notes: safeText(notes, 4000),
      changes: changes || {},
    },
    prefer: "return=minimal",
  });
}

async function patchStory(id, patch) {
  const rows = await supabaseRest("ice_stories", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: { ...patch, updated_at: nowIso() },
    prefer: "return=representation",
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function saveEditorial(story, actor, input) {
  const fields = editedFields(input, story);
  if (!fields.title || !fields.content) throw new Error("标题和正文不能为空");

  const patch = {
    title: fields.title,
    summary: fields.summary,
    content: fields.content,
    cover_image: fields.coverImage,
    final_title: fields.title,
    final_summary: fields.summary,
    final_content: fields.content,
    final_cover_image: fields.coverImage,
    editor_notes: safeText(input.notes, 4000),
    human_review_status: "editing",
    reviewed_by: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || "",
    reviewed_at: nowIso(),
  };

  const updated = await patchStory(story.id, patch);
  await logReview({
    story,
    actor,
    action: "save_editorial",
    toStatus: updated.status,
    notes: input.notes,
    changes: {
      title_changed: fields.title !== story.title,
      summary_changed: fields.summary !== story.summary,
      content_changed: fields.content !== story.content,
      cover_changed: fields.coverImage !== story.cover_image,
    },
  });
  return updated;
}

async function approveStory(story, actor, input) {
  const eligible = approvalEligibility(story);
  if (!eligible.ok) throw new Error(`不能批准：${eligible.reason}`);

  const fields = editedFields(input, story);
  if (!fields.title || !fields.content) throw new Error("标题和正文不能为空");

  let scheduledAt = safeText(input.scheduled_at, 80);
  if (scheduledAt) {
    const parsed = new Date(scheduledAt);
    if (Number.isNaN(parsed.getTime())) throw new Error("排期时间格式不正确");
    if (parsed < new Date()) scheduledAt = roundToNextHalfHour(new Date()).toISOString();
    else scheduledAt = parsed.toISOString();
  } else {
    scheduledAt = await defaultSchedule();
  }

  const patch = {
    title: fields.title,
    summary: fields.summary,
    content: fields.content,
    cover_image: fields.coverImage,
    final_title: fields.title,
    final_summary: fields.summary,
    final_content: fields.content,
    final_cover_image: fields.coverImage,
    status: "approved",
    human_review_status: "approved",
    scheduled_at: scheduledAt,
    editor_notes: safeText(input.notes, 4000),
    reviewed_by: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || "",
    reviewed_at: nowIso(),
  };

  const updated = await patchStory(story.id, patch);
  await logReview({
    story,
    actor,
    action: "approve_schedule",
    toStatus: "approved",
    notes: input.notes,
    changes: { scheduled_at: scheduledAt, title: fields.title },
  });
  return updated;
}

async function leadPost(story) {
  const preferred = story.ai_payload?.lead_source_post_id;
  if (preferred) {
    const rows = await supabaseRest("ice_posts", {
      query: { select: "*", x_post_id: `eq.${preferred}`, limit: "1" },
    });
    if (Array.isArray(rows) && rows[0]) return rows[0];
  }

  const rows = await supabaseRest("ice_posts", {
    query: {
      select: "*",
      event_fingerprint: `eq.${story.event_fingerprint}`,
      order: "trust_tier.asc,source_created_at.asc",
      limit: "1",
    },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function evidenceFor(storyId) {
  const rows = await supabaseRest("ice_story_evidence", {
    query: {
      select: "*",
      story_id: `eq.${storyId}`,
      order: "created_at.asc",
      limit: "100",
    },
  });
  return Array.isArray(rows) ? rows : [];
}

async function publishNow(story, actor, input) {
  const eligible = approvalEligibility(story);
  if (!eligible.ok) throw new Error(`不能发布：${eligible.reason}`);

  const fields = editedFields(input, story);
  if (!fields.title || !fields.content) throw new Error("标题和正文不能为空");

  if (story.article_id) {
    return { article_id: story.article_id, already_published: true };
  }

  const post = await leadPost(story);
  if (!post) throw new Error("没有找到可用的原始信源帖子");

  const duplicateRows = await supabaseRest("articles", {
    query: {
      select: "id",
      source_platform: "eq.x",
      source_post_id: `eq.${post.x_post_id}`,
      limit: "1",
    },
  });
  const duplicate = Array.isArray(duplicateRows) ? duplicateRows[0] : null;

  const evidence = await evidenceFor(story.id);
  const time = nowIso();
  let articleId = duplicate?.id || null;

  if (!articleId) {
    articleId = crypto.randomUUID();
    const rows = await supabaseRest("articles", {
      method: "POST",
      body: {
        id: articleId,
        title: fields.title,
        slug: `ice-${story.event_fingerprint}`,
        summary: fields.summary,
        content: fields.content,
        category_name: "移民美国",
        cover_image: fields.coverImage,
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
        review_status: "human_approved",
        metadata: {
          event_fingerprint: story.event_fingerprint,
          total_score: story.total_score,
          independent_source_count: story.independent_source_count,
          official_source_count: story.official_source_count,
          media_source_count: story.media_source_count,
          organization_source_count: story.organization_source_count,
          decision_reason: story.decision_reason,
          reviewer_email: actor.user.email || actor.admin.email || "",
          reviewed_at: time,
          editor_notes: safeText(input.notes, 4000),
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
    articleId = article?.id || articleId;
  }

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
    article_id: String(articleId),
    published_at: time,
    scheduled_at: null,
    editor_notes: safeText(input.notes, 4000),
    reviewed_by: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || "",
    reviewed_at: time,
  });

  await logReview({
    story,
    actor,
    action: "publish_now",
    toStatus: "published",
    notes: input.notes,
    changes: { article_id: articleId, title: fields.title },
  });

  return { story: updated, article_id: articleId, already_published: Boolean(duplicate) };
}

async function simpleDecision(story, actor, input, action) {
  const notes = safeText(input.notes, 4000);
  const common = {
    editor_notes: notes,
    reviewed_by: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || "",
    reviewed_at: nowIso(),
    scheduled_at: null,
  };

  let patch;
  let toStatus;
  if (action === "wait") {
    toStatus = "pending_corroboration";
    patch = { ...common, status: toStatus, human_review_status: "waiting" };
  } else if (action === "rewrite") {
    toStatus = "pending_review";
    patch = { ...common, status: toStatus, human_review_status: "rewrite_requested" };
  } else if (action === "reject") {
    if (!notes) throw new Error("拒绝发布时必须填写审核理由");
    toStatus = "rejected";
    patch = { ...common, status: toStatus, human_review_status: "rejected" };
  } else {
    throw new Error("未知审核动作");
  }

  const updated = await patchStory(story.id, patch);
  await logReview({
    story,
    actor,
    action,
    toStatus,
    notes,
    changes: {},
  });
  return updated;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return response(204, {});
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });

  try {
    const actor = await authenticate(event);
    const input = JSON.parse(event.body || "{}");
    const action = safeText(input.action, 60);

    if (action === "list") {
      return response(200, { stories: await listStories() });
    }

    if (action === "detail") {
      return response(200, await storyDetail(safeText(input.story_id, 80)));
    }

    const story = await getStory(safeText(input.story_id, 80));

    if (action === "save") {
      return response(200, { story: await saveEditorial(story, actor, input) });
    }
    if (action === "approve") {
      return response(200, { story: await approveStory(story, actor, input) });
    }
    if (action === "publish_now") {
      return response(200, await publishNow(story, actor, input));
    }
    if (["wait", "rewrite", "reject"].includes(action)) {
      return response(200, { story: await simpleDecision(story, actor, input, action) });
    }

    return response(400, { error: "未知操作" });
  } catch (error) {
    console.error("ICE review function error:", error);
    return response(error.statusCode || 500, {
      error: error.message || String(error),
    });
  }
};
