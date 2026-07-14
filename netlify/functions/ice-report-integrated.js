const crypto = require("node:crypto");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_hSmKJghvQoJKg0m5loDQ2g_f1gu8qak";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const PRIVATE_BUCKET = process.env.ICE_REPORT_PRIVATE_BUCKET || "ice-report-private";
const PUBLIC_BUCKET = process.env.ICE_REPORT_PUBLIC_BUCKET || "ice-report-public";

function json(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, body: JSON.stringify(body) };
}
function safeText(value, max = 20000) { return String(value ?? "").trim().replace(/\u0000/g, "").slice(0, max); }
function nowIso() { return new Date().toISOString(); }
async function readJson(response) { const text = await response.text(); if (!text) return null; try { return JSON.parse(text); } catch { return { raw: text }; } }
async function serviceFetch(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("服务端数据库配置不完整");
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...(options.headers || {}) } });
  const body = await readJson(response);
  if (!response.ok) { const error = new Error(body?.message || body?.details || body?.error || body?.raw || `数据库请求失败（${response.status}）`); error.statusCode = response.status; throw error; }
  return body;
}
async function rest(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value)); });
  return serviceFetch(`/rest/v1/${table}${url.search}`, { method, headers: { "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function authenticate(event) {
  const token = safeText(event.headers.authorization || event.headers.Authorization, 1000).replace(/^Bearer\s+/i, "");
  if (!token) { const error = new Error("缺少后台登录凭证"); error.statusCode = 401; throw error; }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  const user = await readJson(response);
  if (!response.ok || !user?.id) { const error = new Error("后台登录状态无效，请重新登录"); error.statusCode = 401; throw error; }
  let rows = await rest("admin_users", { query: { select: "id,user_id,email,role,is_active", user_id: `eq.${user.id}`, is_active: "eq.true", limit: "1" } });
  let admin = Array.isArray(rows) ? rows[0] : null;
  const ownerEmail = safeText(process.env.TRRB_OWNER_EMAIL || "tangrenribao@gmail.com", 300).toLowerCase();
  const ownerUid = safeText(process.env.TRRB_OWNER_UID || "4c491ee3-a9f0-42c9-9bee-1abb52b20b01", 100);
  if (!admin && user.id === ownerUid && safeText(user.email, 300).toLowerCase() === ownerEmail) admin = { role: "owner", email: ownerEmail };
  if (!admin || !["owner", "admin"].includes(String(admin.role || "").toLowerCase())) { const error = new Error("这个账号没有主后台管理权限"); error.statusCode = 403; throw error; }
  return { user, admin };
}
function encodePath(path) { return String(path || "").split("/").map(encodeURIComponent).join("/"); }
async function signedReadUrl(path, expiresIn = 3600) {
  if (!path) return "";
  const data = await serviceFetch(`/storage/v1/object/sign/${encodeURIComponent(PRIVATE_BUCKET)}/${encodePath(path)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn }) });
  const relative = data?.signedURL || data?.signedUrl;
  return !relative ? "" : (/^https?:\/\//i.test(relative) ? relative : `${SUPABASE_URL}/storage/v1${relative.startsWith("/") ? "" : "/"}${relative}`);
}
function publicUrl(path) { return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(PUBLIC_BUCKET)}/${encodePath(path)}`; }
async function getReport(id) {
  const rows = await rest("ice_user_reports", { query: { select: "*", id: `eq.${safeText(id, 80)}`, limit: "1" } });
  const report = Array.isArray(rows) ? rows[0] : null;
  if (!report) { const error = new Error("没有找到这条用户投稿"); error.statusCode = 404; throw error; }
  return report;
}
function extractFacts(report) {
  const text = `${report.location_text || ""} ${report.event_description || ""}`;
  const agency = (text.match(/\b(ICE|HSI|DHS|CBP|ERO)\b/i)?.[1] || (text.match(/移民及海关执法局/) ? "ICE" : "ICE")).toUpperCase();
  const location = safeText(report.location_text, 120) || "地点待确认";
  let count = null;
  const patterns = [/(?:逮捕|抓捕|拘留|羁押|扣押|带走)[^。；;，,]{0,12}?(\d{1,3})\s*(?:名|人|位)/, /(\d{1,3})\s*(?:名|人|位)[^。；;，,]{0,12}?(?:被捕|被拘留|遭拘留|被带走)/, /(?:一名|1名)[^。；;]{0,12}?(?:被捕|被拘留|被带走|男子|女子)/];
  for (const pattern of patterns) { const match = text.match(pattern); if (match) { count = match[1] ? Number(match[1]) : 1; break; } }
  const countries = ["中国","哥伦比亚","墨西哥","委内瑞拉","危地马拉","洪都拉斯","厄瓜多尔","萨尔瓦多","古巴","海地","印度","巴西","秘鲁","多米尼加","尼加拉瓜","俄罗斯","乌克兰","越南","韩国","菲律宾"];
  const country = countries.find((name) => text.includes(name)) || "";
  const countText = count ? `${count}${country ? `名${country}籍人员` : "人"}` : (country ? `${country}籍人员` : "人员");
  const title = `${agency}在${location}${/(送医|医院|急诊)/.test(text) ? `将${countText}送医` : `拘留${countText}`}`;
  return { agency, location, people_count: count, country, suggested_title: title.slice(0, 220) };
}
function editorial(report, input = {}) {
  const facts = extractFacts(report);
  const content = safeText(input.content || report.admin_content || report.event_description, 20000);
  const summary = safeText(input.summary || report.admin_summary || content.replace(/\s+/g, " ").slice(0, 300), 1000);
  const title = safeText(input.title || report.admin_title || facts.suggested_title, 220);
  return { title, summary, content, facts };
}
async function patchReport(id, patch) {
  const rows = await rest("ice_user_reports", { method: "PATCH", query: { id: `eq.${id}` }, body: { ...patch, updated_at: nowIso() }, prefer: "return=representation" });
  return Array.isArray(rows) ? rows[0] : rows;
}
async function listReports() {
  const rows = await rest("ice_user_reports", { query: { select: "*", order: "created_at.desc", limit: "250" } });
  return Promise.all((Array.isArray(rows) ? rows : []).map(async (report) => {
    const image = (Array.isArray(report.media) ? report.media : []).find((item) => String(item.mime_type || "").startsWith("image/"));
    let preview = report.cover_image || "";
    if (!preview && image?.path) try { preview = await signedReadUrl(image.path, 1800); } catch {}
    const e = editorial(report);
    return { ...report, admin_title: e.title, admin_summary: e.summary, admin_content: e.content, extracted_facts: e.facts, preview_url: preview };
  }));
}
async function detailReport(id) {
  const report = await getReport(id); const media = [];
  for (const item of Array.isArray(report.media) ? report.media : []) media.push({ ...item, url: await signedReadUrl(item.path) });
  const e = editorial(report);
  return { report: { ...report, admin_title: e.title, admin_summary: e.summary, admin_content: e.content, extracted_facts: e.facts, signed_media: media }, editorial: e };
}
async function saveReport(report, actor, input) {
  const e = editorial(report, input);
  return patchReport(report.id, { status: "reviewing", admin_title: e.title, admin_summary: e.summary, admin_content: e.content, selected_cover_path: safeText(input.cover_path, 500), review_note: safeText(input.review_note, 4000), reviewer_user_id: actor.user.id, reviewer_email: actor.user.email || actor.admin.email || "", reviewed_at: nowIso() });
}
async function copyToPublic(report, item) {
  if (item.url && item.path?.startsWith("published/")) return item;
  const ext = String(item.path || "").split(".").pop().replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const destination = `published/${report.id}/${crypto.randomUUID()}.${ext}`;
  await serviceFetch("/storage/v1/object/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bucketId: PRIVATE_BUCKET, sourceKey: item.path, destinationBucket: PUBLIC_BUCKET, destinationKey: destination }) });
  return { ...item, source_path: item.path, path: destination, url: publicUrl(destination) };
}
async function existingArticle(reportId) {
  const rows = await rest("articles", { query: { select: "id", source_platform: "eq.user_report", source_post_id: `eq.${reportId}`, limit: "1" } });
  return Array.isArray(rows) ? rows[0] : null;
}
async function publishReport(report, actor, input) {
  const e = editorial(report, input); if (!e.title || !e.content) throw new Error("标题和正文不能为空");
  const publishedMedia = [];
  for (const item of Array.isArray(report.media) ? report.media : []) publishedMedia.push(await copyToPublic(report, item));
  const selected = safeText(input.cover_path || report.selected_cover_path, 500);
  const cover = publishedMedia.find((item) => item.source_path === selected || item.path === selected) || publishedMedia.find((item) => String(item.mime_type || "").startsWith("image/")) || null;
  const time = nowIso(); const duplicate = await existingArticle(report.id); const articleId = duplicate?.id || crypto.randomUUID();
  const payload = { title: e.title, summary: e.summary, content: e.content, category_name: "现场线索", cover_image: cover?.url || report.cover_image || "", seo_keywords: "ICE,现场线索,随手拍,移民执法", author: "ICE随手拍", status: "published", published_at: time, topic_key: "ice", source_platform: "user_report", source_post_id: report.id, source_url: "https://trrb.net/topic/ice/", source_account: "ICE随手拍", source_created_at: report.created_at, review_status: "human_verified_user_report", metadata: { user_report_id: report.id, report_date: report.report_date, location_text: report.location_text, event_type: "arrest", people_count: e.facts.people_count || 0, country: e.facts.country, agency: e.facts.agency, published_media: publishedMedia, reviewer_email: actor.user.email || actor.admin.email || "", reviewed_at: time } };
  if (duplicate?.id) await rest("articles", { method: "PATCH", query: { id: `eq.${articleId}` }, body: payload, prefer: "return=minimal" });
  else await rest("articles", { method: "POST", body: { id: articleId, slug: `ice-report-${report.id}`, created_at: time, ...payload }, prefer: "return=minimal" });
  await patchReport(report.id, { status: "published", admin_title: e.title, admin_summary: e.summary, admin_content: e.content, cover_image: payload.cover_image, selected_cover_path: selected, article_id: articleId, review_note: safeText(input.review_note, 4000), reviewer_user_id: actor.user.id, reviewer_email: actor.user.email || actor.admin.email || "", reviewed_at: time, published_at: time });
  return { article_id: articleId, duplicate: Boolean(duplicate) };
}
async function unpublishReport(report) {
  const article = await existingArticle(report.id);
  if (article?.id) await rest("articles", { method: "PATCH", query: { id: `eq.${article.id}` }, body: { status: "hidden", updated_at: nowIso() }, prefer: "return=minimal" });
  return patchReport(report.id, { status: "reviewing", published_at: null });
}
async function deletePublication(report) {
  const article = await existingArticle(report.id);
  if (article?.id) await rest("articles", { method: "DELETE", query: { id: `eq.${article.id}` }, prefer: "return=minimal" });
  return patchReport(report.id, { status: "draft", article_id: null, published_at: null });
}
async function deleteReport(report) {
  const article = await existingArticle(report.id);
  if (article?.id) await rest("articles", { method: "DELETE", query: { id: `eq.${article.id}` }, prefer: "return=minimal" });
  await rest("ice_user_reports", { method: "DELETE", query: { id: `eq.${report.id}` }, prefer: "return=minimal" });
  return { deleted: true };
}
async function rejectReport(report, actor, input) {
  const note = safeText(input.review_note, 4000); if (!note) throw new Error("拒绝投稿前必须填写理由");
  return patchReport(report.id, { status: "rejected", review_note: note, reviewer_user_id: actor.user.id, reviewer_email: actor.user.email || actor.admin.email || "", reviewed_at: nowIso() });
}
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const actor = await authenticate(event); const input = JSON.parse(event.body || "{}"); const action = safeText(input.action, 60);
    if (action === "list") return json(200, { reports: await listReports() });
    if (action === "detail") return json(200, await detailReport(input.report_id));
    const report = await getReport(input.report_id);
    if (action === "save") return json(200, { report: await saveReport(report, actor, input) });
    if (action === "publish") return json(200, await publishReport(report, actor, input));
    if (action === "unpublish") return json(200, { report: await unpublishReport(report) });
    if (action === "delete_publication") return json(200, { report: await deletePublication(report) });
    if (action === "delete_report") return json(200, await deleteReport(report));
    if (action === "reject") return json(200, { report: await rejectReport(report, actor, input) });
    return json(400, { error: "未知操作" });
  } catch (error) { console.error("ICE report error:", error); return json(error.statusCode || 500, { error: error.message || String(error) }); }
};
