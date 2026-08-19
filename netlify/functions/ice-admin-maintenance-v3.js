const {
  SUPABASE_URL,
  SERVICE_KEY,
  safeText,
  rest,
  authenticateStaff
} = require('./_shared/supabase-admin');

const PRIVATE_BUCKET = process.env.ICE_REPORT_PRIVATE_BUCKET || "ice-report-private";
const PUBLIC_BUCKET = process.env.ICE_REPORT_PUBLIC_BUCKET || "ice-report-public";

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, body: JSON.stringify(body) };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function encodePath(value) {
  return String(value || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function objectPathFromPublicUrl(value, bucket) {
  const raw = safeText(value, 4000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const marker = `/storage/v1/object/public/${encodeURIComponent(bucket)}/`;
    const index = url.pathname.indexOf(marker);
    if (index < 0) return "";
    return decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch { return ""; }
}

async function deleteStorageObject(bucket, objectPath) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase服务端配置不完整");
  const clean = String(objectPath || "").replace(/^\/+/, "");
  if (!clean) return false;
  const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodePath(clean)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const body = await readJson(response);
    const error = new Error(body?.message || body?.error || `删除存储对象失败（${response.status}）`);
    error.statusCode = 502;
    throw error;
  }
  return true;
}

async function getReport(reportId) {
  const rows = await rest("ice_user_reports", { query: { select: "id,media,cover_image,article_id,status", id: `eq.${reportId}`, limit: "1" } });
  const report = Array.isArray(rows) ? rows[0] : null;
  if (!report) { const error = new Error("没有找到这条投稿"); error.statusCode = 404; throw error; }
  return report;
}

async function articleForReport(reportId) {
  const rows = await rest("articles", { query: { select: "id,status,metadata,cover_image", source_platform: "eq.user_report", source_post_id: `eq.${reportId}`, limit: "1" } });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function mediaPaths(report, article) {
  const privatePaths = new Set();
  const publicPaths = new Set();
  for (const item of Array.isArray(report?.media) ? report.media : []) {
    const objectPath = safeText(item?.path, 1000);
    if (objectPath) privatePaths.add(objectPath);
  }
  const published = Array.isArray(article?.metadata?.published_media) ? article.metadata.published_media : [];
  for (const item of published) {
    const sourcePath = safeText(item?.source_path, 1000);
    const publicPath = safeText(item?.path, 1000);
    if (sourcePath) privatePaths.add(sourcePath);
    if (publicPath) publicPaths.add(publicPath);
    const fromUrl = objectPathFromPublicUrl(item?.url, PUBLIC_BUCKET);
    if (fromUrl) publicPaths.add(fromUrl);
  }
  for (const url of [report?.cover_image, article?.cover_image]) {
    const objectPath = objectPathFromPublicUrl(url, PUBLIC_BUCKET);
    if (objectPath) publicPaths.add(objectPath);
  }
  return { privatePaths, publicPaths };
}

async function purgePaths(bucket, paths) {
  let deleted = 0;
  for (const objectPath of paths) if (await deleteStorageObject(bucket, objectPath)) deleted += 1;
  return deleted;
}

async function purgePublicMedia(report, article) {
  const { publicPaths } = mediaPaths(report, article);
  return purgePaths(PUBLIC_BUCKET, publicPaths);
}

async function purgeAllMedia(report, article) {
  const { privatePaths, publicPaths } = mediaPaths(report, article);
  const publicDeleted = await purgePaths(PUBLIC_BUCKET, publicPaths);
  const privateDeleted = await purgePaths(PRIVATE_BUCKET, privatePaths);
  return { public_deleted: publicDeleted, private_deleted: privateDeleted };
}

async function patchReport(id, body) {
  await rest("ice_user_reports", { method: "PATCH", query: { id: `eq.${id}` }, body: { ...body, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
}

async function handle(action, input) {
  if (action.startsWith("user_report_")) {
    const reportId = safeText(input.report_id, 100);
    if (!reportId) throw new Error("缺少投稿编号");
    const report = await getReport(reportId);
    const article = await articleForReport(reportId);

    if (action === "user_report_unpublish") {
      const publicDeleted = await purgePublicMedia(report, article);
      if (article?.id) await rest("articles", { method: "PATCH", query: { id: `eq.${article.id}` }, body: { status: "hidden", cover_image: "", updated_at: new Date().toISOString() }, prefer: "return=minimal" });
      await patchReport(reportId, { status: "reviewing", cover_image: "", published_at: null });
      return { ok: true, status: "reviewing", public_media_deleted: publicDeleted };
    }
    if (action === "user_report_delete_article") {
      const publicDeleted = await purgePublicMedia(report, article);
      if (article?.id) await rest("articles", { method: "DELETE", query: { id: `eq.${article.id}` }, prefer: "return=minimal" });
      await patchReport(reportId, { status: "draft", cover_image: "", article_id: null, published_at: null });
      return { ok: true, status: "draft", public_media_deleted: publicDeleted };
    }
    if (action === "user_report_delete_all") {
      const deletedMedia = await purgeAllMedia(report, article);
      if (article?.id) await rest("articles", { method: "DELETE", query: { id: `eq.${article.id}` }, prefer: "return=minimal" });
      await rest("ice_user_reports", { method: "DELETE", query: { id: `eq.${reportId}` }, prefer: "return=minimal" });
      return { ok: true, deleted: true, ...deletedMedia };
    }
  }
  if (action === "story_delete") {
    const storyId = safeText(input.story_id, 100);
    if (!storyId) throw new Error("缺少候选记录编号");
    await rest("ice_story_evidence", { method: "DELETE", query: { story_id: `eq.${storyId}` }, prefer: "return=minimal" });
    await rest("ice_stories", { method: "DELETE", query: { id: `eq.${storyId}` }, prefer: "return=minimal" });
    return { ok: true, deleted: true };
  }
  throw new Error("未知操作");
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    await authenticateStaff(event, ["owner", "editor"]);
    const input = JSON.parse(event.body || "{}");
    return json(200, await handle(safeText(input.action, 80), input));
  } catch (error) {
    console.error("ICE maintenance error", error);
    return json(error.statusCode || 500, { error: error.message || String(error) });
  }
};
