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
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
    body: JSON.stringify(body),
  };
}

function safeText(value, max = 20000) {
  return String(value ?? "").trim().replace(/\u0000/g, "").slice(0, max);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function serviceFetch(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Netlify尚未配置Supabase服务端密钥");
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      ...(options.headers || {}),
    },
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(body?.message || body?.details || body?.error || body?.raw || `Supabase ${response.status}`);
  }
  return body;
}

async function rest(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  return serviceFetch(`/rest/v1/${table}${url.search}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function authenticate(event) {
  const token = safeText(event.headers.authorization || event.headers.Authorization, 500).replace(/^Bearer\s+/i, "");
  if (!token) {
    const error = new Error("缺少后台登录凭证");
    error.statusCode = 401;
    throw error;
  }

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const user = await readJson(userResponse);
  if (!userResponse.ok || !user?.id) {
    const error = new Error("后台登录状态无效，请重新登录");
    error.statusCode = 401;
    throw error;
  }

  let rows = await rest("admin_users", {
    query: { select: "id,user_id,email,role,is_active", user_id: `eq.${user.id}`, is_active: "eq.true", limit: "1" },
  });
  let admin = Array.isArray(rows) ? rows[0] : null;
  if (!admin && user.email) {
    rows = await rest("admin_users", {
      query: { select: "id,user_id,email,role,is_active", email: `ilike.${safeText(user.email, 300)}`, is_active: "eq.true", limit: "1" },
    });
    admin = Array.isArray(rows) ? rows[0] : null;
  }

  if (!admin || !["owner", "admin"].includes(String(admin.role || "").toLowerCase())) {
    const error = new Error("这个账号没有随手拍审核权限");
    error.statusCode = 403;
    throw error;
  }
  return { user, admin };
}

function encodePath(path) {
  return String(path || "").split("/").map(encodeURIComponent).join("/");
}

async function signedReadUrl(path, expiresIn = 3600) {
  const data = await serviceFetch(
    `/storage/v1/object/sign/${encodeURIComponent(PRIVATE_BUCKET)}/${encodePath(path)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn }),
    }
  );
  const relative = data?.signedURL || data?.signedUrl;
  if (!relative) return "";
  return /^https?:\/\//i.test(relative)
    ? relative
    : `${SUPABASE_URL}/storage/v1${relative.startsWith("/") ? "" : "/"}${relative}`;
}

async function withSignedMedia(report) {
  const media = Array.isArray(report.media) ? report.media : [];
  const signed = [];
  for (const item of media) {
    signed.push({ ...item, url: await signedReadUrl(item.path) });
  }
  return { ...report, signed_media: signed };
}

async function getReport(id) {
  const rows = await rest("ice_user_reports", {
    query: { select: "*", id: `eq.${safeText(id, 80)}`, limit: "1" },
  });
  const report = Array.isArray(rows) ? rows[0] : null;
  if (!report) {
    const error = new Error("没有找到这条随手拍线索");
    error.statusCode = 404;
    throw error;
  }
  return report;
}

async function listReports(input) {
  const status = ["draft","reviewing","published","rejected"].includes(input.status) ? input.status : "";
  const query = {
    select: "id,report_date,location_text,event_description,contact_info,media,status,admin_title,admin_summary,cover_image,article_id,reviewer_email,review_note,reviewed_at,published_at,created_at,updated_at",
    order: "created_at.desc",
    limit: "250",
  };
  if (status) query.status = `eq.${status}`;
  const rows = await rest("ice_user_reports", { query });
  return Array.isArray(rows) ? rows : [];
}

function defaultEditorial(report) {
  const clean = safeText(report.event_description, 5000);
  const summary = clean.replace(/\s+/g, " ").slice(0, 150);
  return {
    title: report.admin_title || `${report.location_text}出现ICE执法线索`,
    summary: report.admin_summary || summary,
    content: report.admin_content || `唐人日报讯：${report.report_date}，有读者通过“ICE随手拍”提交线索称，在${report.location_text}目击相关执法活动。\n\n${clean}\n\n该线索经编辑审核后发布。公开内容已隐去提交者联系方式及其他非必要个人信息。`,
  };
}

async function detailReport(id) {
  const report = await getReport(id);
  return { report: await withSignedMedia(report), editorial: defaultEditorial(report) };
}

async function patchReport(id, patch) {
  const rows = await rest("ice_user_reports", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: { ...patch, updated_at: new Date().toISOString() },
    prefer: "return=representation",
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function saveReport(report, actor, input) {
  return patchReport(report.id, {
    status: "reviewing",
    admin_title: safeText(input.title, 220),
    admin_summary: safeText(input.summary, 1200),
    admin_content: safeText(input.content, 30000),
    selected_cover_path: safeText(input.cover_path, 500),
    review_note: safeText(input.review_note, 4000),
    reviewer_user_id: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || "",
    reviewed_at: new Date().toISOString(),
  });
}

async function rejectReport(report, actor, input) {
  const note = safeText(input.review_note, 4000);
  if (!note) {
    const error = new Error("拒绝前必须填写审核理由");
    error.statusCode = 400;
    throw error;
  }
  return patchReport(report.id, {
    status: "rejected",
    review_note: note,
    reviewer_user_id: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || "",
    reviewed_at: new Date().toISOString(),
  });
}

function publicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(PUBLIC_BUCKET)}/${encodePath(path)}`;
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
      destinationKey: destination,
    }),
  });
  return { ...item, source_path: item.path, path: destination, url: publicUrl(destination) };
}

async function existingArticle(reportId) {
  const rows = await rest("articles", {
    query: {
      select: "id",
      source_platform: "eq.user_report",
      source_post_id: `eq.${reportId}`,
      limit: "1",
    },
  });
  return Array.isArray(rows) ? rows[0] : null;
}

async function publishReport(report, actor, input) {
  const editorial = defaultEditorial({ ...report, admin_title: input.title, admin_summary: input.summary, admin_content: input.content });
  const title = safeText(input.title || editorial.title, 220);
  const summary = safeText(input.summary || editorial.summary, 1200);
  const content = safeText(input.content || editorial.content, 30000);
  if (!title || !content) {
    const error = new Error("标题和正文不能为空");
    error.statusCode = 400;
    throw error;
  }

  const duplicate = await existingArticle(report.id);
  if (duplicate?.id) {
    await patchReport(report.id, {
      status: "published",
      article_id: String(duplicate.id),
      reviewer_user_id: actor.user.id,
      reviewer_email: actor.user.email || actor.admin.email || "",
      reviewed_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
    });
    return { article_id: duplicate.id, duplicate: true };
  }

  const sourceMedia = Array.isArray(report.media) ? report.media : [];
  const publishedMedia = [];
  for (const item of sourceMedia) publishedMedia.push(await copyToPublic(report, item));

  const selectedCoverPath = safeText(input.cover_path || report.selected_cover_path, 500);
  const cover = publishedMedia.find((item) => item.source_path === selectedCoverPath)
    || publishedMedia.find((item) => String(item.mime_type || "").startsWith("image/"))
    || null;

  const time = new Date().toISOString();
  const articleId = crypto.randomUUID();
  const rows = await rest("articles", {
    method: "POST",
    body: {
      id: articleId,
      title,
      slug: `ice-report-${report.id}`,
      summary,
      content,
      category_name: "移民美国",
      cover_image: cover?.url || "",
      seo_keywords: "ICE,移民执法,随手拍,美国移民",
      author: "唐人日报编辑部",
      status: "published",
      published_at: time,
      created_at: time,
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
        event_type: "other",
        people_count: 0,
        published_media: publishedMedia,
        reviewer_email: actor.user.email || actor.admin.email || "",
      },
    },
    prefer: "return=representation",
  });

  const article = Array.isArray(rows) ? rows[0] : rows;
  const finalId = String(article?.id || articleId);
  await patchReport(report.id, {
    status: "published",
    admin_title: title,
    admin_summary: summary,
    admin_content: content,
    cover_image: cover?.url || "",
    selected_cover_path: selectedCoverPath,
    article_id: finalId,
    review_note: safeText(input.review_note, 4000),
    reviewer_user_id: actor.user.id,
    reviewer_email: actor.user.email || actor.admin.email || "",
    reviewed_at: time,
    published_at: time,
  });
  return { article_id: finalId };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const input = JSON.parse(event.body || "{}");
    const actor = await authenticate(event);
    const action = safeText(input.action, 50);

    if (action === "list") return json(200, { reports: await listReports(input) });
    if (action === "detail") return json(200, await detailReport(input.report_id));

    const report = await getReport(input.report_id);
    if (action === "save") return json(200, { report: await saveReport(report, actor, input) });
    if (action === "reject") return json(200, { report: await rejectReport(report, actor, input) });
    if (action === "publish") return json(200, await publishReport(report, actor, input));
    return json(400, { error: "无效操作" });
  } catch (error) {
    console.error("ICE随手拍审核接口失败：", error);
    return json(error.statusCode || 500, { error: error.message || "服务器错误" });
  }
};
