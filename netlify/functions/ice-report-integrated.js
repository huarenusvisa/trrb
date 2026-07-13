const crypto = require("node:crypto");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const PRIVATE_BUCKET = process.env.ICE_REPORT_PRIVATE_BUCKET || "ice-report-private";
const PUBLIC_BUCKET = process.env.ICE_REPORT_PUBLIC_BUCKET || "ice-report-public";

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

// event_description has already been accepted by PostgreSQL. Return the exact
// stored string: no trim, whitespace collapse, prefix, suffix, translation,
// sanitizing rewrite or length truncation is allowed on the publication path.
function originalSubmission(report) {
  return String(report?.event_description ?? "");
}

function publicationTitle(report) {
  const location = safeText(report?.location_text, 140) || "地点待确认";
  return `${location}ICE现场投稿`;
}

function originalHash(report) {
  return crypto.createHash("sha256").update(originalSubmission(report), "utf8").digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function serviceFetch(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("服务端数据库配置不完整");
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...(options.headers || {}) }
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(body?.message || body?.details || body?.error || body?.raw || `数据库请求失败（${response.status}）`);
  return body;
}

async function rest(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  return serviceFetch(`/rest/v1/${table}${url.search}`, {
    method,
    headers: { "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function authenticate(event) {
  const token = safeText(event.headers.authorization || event.headers.Authorization, 1000).replace(/^Bearer\s+/i, "");
  if (!token) { const error = new Error("缺少后台登录凭证"); error.statusCode = 401; throw error; }

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` }
  });
  const user = await readJson(userResponse);
  if (!userResponse.ok || !user?.id) { const error = new Error("后台登录状态无效，请重新登录"); error.statusCode = 401; throw error; }

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

  const ownerEmail = safeText(process.env.TRRB_OWNER_EMAIL || "tangrenribao@gmail.com", 300).toLowerCase();
  const ownerUid = safeText(process.env.TRRB_OWNER_UID || "4c491ee3-a9f0-42c9-9bee-1abb52b20b01", 100);
  if (!admin && user.id === ownerUid && safeText(user.email, 300).toLowerCase() === ownerEmail) {
    admin = { user_id: ownerUid, email: ownerEmail, role: "owner", is_active: true };
  }
  if (!admin || !["owner", "admin"].includes(String(admin.role || "").toLowerCase())) {
    const error = new Error("这个账号没有主后台管理权限"); error.statusCode = 403; throw error;
  }
  return { user, admin };
}

function encodePath(path) {
  return String(path || "").split("/").map(encodeURIComponent).join("/");
}

async function signedReadUrl(path, expiresIn = 3600) {
  if (!path) return "";
  const data = await serviceFetch(`/storage/v1/object/sign/${encodeURIComponent(PRIVATE_BUCKET)}/${encodePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn })
  });
  const relative = data?.signedURL || data?.signedUrl;
  if (!relative) return "";
  return /^https?:\/\//i.test(relative) ? relative : `${SUPABASE_URL}/storage/v1${relative.startsWith("/") ? "" : "/"}${relative}`;
}

function publicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(PUBLIC_BUCKET)}/${encodePath(path)}`;
}

async function getReport(id) {
  const rows = await rest("ice_user_reports", {
    query: { select: "*", id: `eq.${safeText(id, 80)}`, limit: "1" }
  });
  const report = Array.isArray(rows) ? rows[0] : null;
  if (!report) { const error = new Error("没有找到这条用户投稿"); error.statusCode = 404; throw error; }
  return report;
}

async function listReports() {
  const rows = await rest("ice_user_reports", {
    query: { select: "*", order: "created_at.desc", limit: "250" }
  });
  const reports = Array.isArray(rows) ? rows : [];
  return Promise.all(reports.map(async (report) => {
    const media = Array.isArray(report.media) ? report.media : [];
    const image = media.find((item) => String(item.mime_type || "").startsWith("image/"));
    let preview = report.cover_image || "";
    if (!preview && image?.path) {
      try { preview = await signedReadUrl(image.path, 1800); } catch { preview = ""; }
    }
    return { ...report, preview_url: preview };
  }));
}

function lockedEditorial(report) {
  const content = originalSubmission(report);
  return {
    title: publicationTitle(report),
    summary: content,
    content,
    original_submission_locked: true,
    ai_intervention: false
  };
}

async function detailReport(id) {
  const report = await getReport(id);
  const media = [];
  for (const item of Array.isArray(report.media) ? report.media : []) {
    media.push({ ...item, url: await signedReadUrl(item.path) });
  }
  return { report: { ...report, signed_media: media }, editorial: lockedEditorial(report) };
}

async function patchReport(id, patch) {
  const rows = await rest("ice_user_reports", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: { ...patch, updated_at: nowIso() },
    prefer: "return=representation"
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function saveReport(report, actor, input) {
  const editorial = lockedEditorial(report);
  return patchReport(report.id, {
    status: "reviewing",
    admin_title: editorial.title,
    admin_summary: editorial.summary,
    admin_content: editorial.content,
    selected_cover_path: safeText(input.cover_path, 500),
    review_note: safeText(input.review_note, 4000),
    reviewer_user_id: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || "",
    reviewed_at: nowIso()
  });
}

async function rejectReport(report, actor, input) {
  const note = safeText(input.review_note, 4000);
  if (!note) { const error = new Error("拒绝投稿前必须填写审核理由"); error.statusCode = 400; throw error; }
  return patchReport(report.id, {
    status: "rejected",
    review_note: note,
    reviewer_user_id: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || "",
    reviewed_at: nowIso()
  });
}

async function copyToPublic(report, item) {
  const ext = String(item.path || "").split(".").pop().replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const destination = `published/${report.id}/${crypto.randomUUID()}.${ext}`;
  await serviceFetch("/storage/v1/object/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucketId: PRIVATE_BUCKET,
      sourceKey: item.path,
      destinationBucket: PUBLIC_BUCKET,
      destinationKey: destination
    })
  });
  return { ...item, source_path: item.path, path: destination, url: publicUrl(destination) };
}

async function existingArticle(reportId) {
  const rows = await rest("articles", {
    query: { select: "id", source_platform: "eq.user_report", source_post_id: `eq.${reportId}`, limit: "1" }
  });
  return Array.isArray(rows) ? rows[0] : null;
}

function articlePayload(report, actor, publishedMedia, coverUrl, time) {
  const editorial = lockedEditorial(report);
  return {
    title: editorial.title,
    summary: editorial.summary,
    content: editorial.content,
    category_name: "驱逐快报",
    cover_image: coverUrl,
    seo_keywords: "ICE,移民执法,用户投稿,随手拍,驱逐快报",
    author: "ICE随手拍",
    status: "published",
    published_at: time,
    topic_key: "ice",
    source_platform: "user_report",
    source_post_id: report.id,
    source_url: "https://trrb.net/topic/ice/",
    source_account: "ICE随手拍",
    source_created_at: report.created_at,
    review_status: "human_verified_user_report",
    metadata: {
      user_report_id: report.id,
      report_date: report.report_date,
      location_text: report.location_text,
      published_media: publishedMedia,
      ai_intervention: false,
      original_submission_locked: true,
      original_submission_sha256: originalHash(report),
      reviewer_email: actor.user.email || actor.admin.email || "",
      reviewed_at: time
    }
  };
}

async function publishReport(report, actor, input) {
  const editorial = lockedEditorial(report);
  if (!editorial.content) { const error = new Error("用户原始投稿内容为空，不能发布"); error.statusCode = 400; throw error; }

  const publishedMedia = [];
  for (const item of Array.isArray(report.media) ? report.media : []) {
    publishedMedia.push(await copyToPublic(report, item));
  }
  const selected = safeText(input.cover_path || report.selected_cover_path, 500);
  const cover = publishedMedia.find((item) => item.source_path === selected)
    || publishedMedia.find((item) => String(item.mime_type || "").startsWith("image/"))
    || null;
  const time = nowIso();
  const payload = articlePayload(report, actor, publishedMedia, cover?.url || "", time);
  const duplicate = await existingArticle(report.id);
  let articleId = duplicate?.id || crypto.randomUUID();

  if (duplicate?.id) {
    await rest("articles", {
      method: "PATCH",
      query: { id: `eq.${duplicate.id}` },
      body: payload,
      prefer: "return=minimal"
    });
  } else {
    const rows = await rest("articles", {
      method: "POST",
      body: {
        id: articleId,
        slug: `ice-report-${report.id}`,
        created_at: time,
        ...payload
      },
      prefer: "return=representation"
    });
    const article = Array.isArray(rows) ? rows[0] : rows;
    articleId = String(article?.id || articleId);
  }

  await patchReport(report.id, {
    status: "published",
    admin_title: editorial.title,
    admin_summary: editorial.summary,
    admin_content: editorial.content,
    cover_image: cover?.url || "",
    selected_cover_path: selected,
    article_id: String(articleId),
    review_note: safeText(input.review_note, 4000),
    reviewer_user_id: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || "",
    reviewed_at: time,
    published_at: time
  });

  return {
    article_id: String(articleId),
    duplicate: Boolean(duplicate),
    original_submission_locked: true,
    ai_intervention: false,
    original_submission_sha256: originalHash(report)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const actor = await authenticate(event);
    const input = JSON.parse(event.body || "{}");
    const action = safeText(input.action, 60);

    if (action === "list") return json(200, { reports: await listReports() });
    if (action === "detail") return json(200, await detailReport(input.report_id));

    const report = await getReport(input.report_id);
    if (action === "save") return json(200, { report: await saveReport(report, actor, input) });
    if (action === "reject") return json(200, { report: await rejectReport(report, actor, input) });
    if (action === "publish") return json(200, await publishReport(report, actor, input));
    return json(400, { error: "未知操作" });
  } catch (error) {
    console.error("ICE integrated report review error:", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};
