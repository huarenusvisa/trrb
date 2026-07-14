#!/usr/bin/env node
import crypto from "node:crypto";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const PRIVATE_BUCKET = process.env.ICE_REPORT_PRIVATE_BUCKET || "ice-report-private";
const PUBLIC_BUCKET = process.env.ICE_REPORT_PUBLIC_BUCKET || "ice-report-public";
const LIMIT = Math.max(1, Math.min(50, Number(process.env.ICE_USER_REPORT_PUBLISH_MAX || 20)));

function requireEnv() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("缺少Supabase环境变量");
}
function headers(prefer = "") {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}
async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await readJson(response);
  if (!response.ok) throw new Error(body?.message || body?.details || body?.error || body?.raw || `HTTP ${response.status}`);
  return body;
}
async function rest(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  return request(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) });
}
function safe(value, max = 20000) { return String(value ?? "").trim().replace(/\u0000/g, "").slice(0, max); }
function encodePath(path) { return String(path || "").split("/").map(encodeURIComponent).join("/"); }
function publicUrl(path) { return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(PUBLIC_BUCKET)}/${encodePath(path)}`; }

function extractFacts(report) {
  const text = `${report.location_text || ""} ${report.event_description || ""}`;
  const agency = (text.match(/\b(ICE|HSI|DHS|CBP|ERO)\b/i)?.[1] || (/(移民及海关执法局|移民海关执法局)/.test(text) ? "ICE" : "ICE")).toUpperCase();
  const location = safe(report.location_text, 120) || "地点待确认";
  let count = null;
  const numberPatterns = [
    /(?:逮捕|抓捕|拘留|羁押|扣押|带走|押送|送往)[^。；;，,]{0,16}?(\d{1,3})\s*(?:名|人|位)/,
    /(\d{1,3})\s*(?:名|人|位)[^。；;，,]{0,16}?(?:被捕|被拘留|遭拘留|被带走|被押送|送医)/,
    /\b(?:arrested|detained|apprehended|took into custody)\s+(\d{1,3})\b/i
  ];
  for (const pattern of numberPatterns) {
    const match = text.match(pattern);
    if (match) { const value = Number(match[1]); if (value > 0 && value <= 500) { count = value; break; } }
  }
  if (count == null && /(?:一名|一位|1名|1位|一人|a man|a woman|one man|one woman|one person|a detainee)/i.test(text) && /(拘留|羁押|被捕|逮捕|带走|押送|detain|arrest|custody)/i.test(text)) count = 1;
  if (count == null && /(?:两名|两人|2名|2人|two people|two men|two women)/i.test(text)) count = 2;
  const countries = ["中国","哥伦比亚","墨西哥","委内瑞拉","危地马拉","洪都拉斯","厄瓜多尔","萨尔瓦多","古巴","海地","印度","巴西","秘鲁","多米尼加","尼加拉瓜","俄罗斯","乌克兰","越南","韩国","菲律宾"];
  const country = countries.find((name) => text.includes(name)) || "";
  const countText = count ? `${count}${country ? `名${country}籍人员` : "人"}` : (country ? `${country}籍人员` : "人员");
  let action = "拘留";
  if (/(送医|医院|急诊)/.test(text)) action = "将";
  const title = action === "将" ? `${agency}在${location}将${countText}送医` : `${agency}在${location}拘留${countText}`;
  return { agency, location, people_count: count || 0, country, title: title.slice(0, 220) };
}

async function copyMedia(report, item) {
  if (!item?.path) return null;
  if (item.url && String(item.path).startsWith("published/")) return item;
  const ext = String(item.path).split(".").pop().replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const destination = `published/${report.id}/${crypto.randomUUID()}.${ext}`;
  await request(`${SUPABASE_URL}/storage/v1/object/copy`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ bucketId: PRIVATE_BUCKET, sourceKey: item.path, destinationBucket: PUBLIC_BUCKET, destinationKey: destination })
  });
  return { ...item, source_path: item.path, path: destination, url: publicUrl(destination) };
}

async function existingArticle(reportId) {
  const rows = await rest("articles", { query: { select: "id", source_platform: "eq.user_report", source_post_id: `eq.${reportId}`, limit: "1" } });
  return Array.isArray(rows) ? rows[0] : null;
}

async function publishReport(report) {
  const facts = extractFacts(report);
  const content = safe(report.admin_content || report.event_description, 20000);
  if (!content) return false;
  const summary = safe(report.admin_summary || content.replace(/\s+/g, " ").slice(0, 300), 1000);
  const title = safe(report.admin_title || facts.title, 220);
  const publishedMedia = [];
  for (const item of Array.isArray(report.media) ? report.media : []) {
    try { const copied = await copyMedia(report, item); if (copied) publishedMedia.push(copied); } catch (error) { console.error(`媒体复制失败 ${report.id}:`, error.message); }
  }
  const cover = publishedMedia.find((item) => String(item.mime_type || "").startsWith("image/")) || null;
  const time = new Date().toISOString();
  const duplicate = await existingArticle(report.id);
  const articleId = duplicate?.id || crypto.randomUUID();
  const payload = {
    title, summary, content,
    category_name: "ICE动态",
    cover_image: cover?.url || "",
    seo_keywords: ["ICE","移民执法","随手拍",facts.agency,facts.location,facts.country].filter(Boolean).join(","),
    author: "ICE随手拍",
    status: "published",
    published_at: time,
    topic_key: "ice",
    source_platform: "user_report",
    source_post_id: report.id,
    source_url: "https://trrb.net/topic/ice/",
    source_account: "ICE随手拍",
    source_created_at: report.created_at,
    review_status: "auto_published_user_report",
    metadata: { user_report_id: report.id, report_date: report.report_date, location_text: report.location_text, event_type: "arrest", people_count: facts.people_count, detained_count: facts.people_count, agency: facts.agency, country: facts.country, published_media: publishedMedia, auto_published: true }
  };
  if (duplicate?.id) await rest("articles", { method: "PATCH", query: { id: `eq.${articleId}` }, body: payload, prefer: "return=minimal" });
  else await rest("articles", { method: "POST", body: { id: articleId, slug: `ice-report-${report.id}`, created_at: time, ...payload }, prefer: "return=minimal" });
  await rest("ice_user_reports", { method: "PATCH", query: { id: `eq.${report.id}` }, body: { status: "published", admin_title: title, admin_summary: summary, admin_content: content, cover_image: payload.cover_image, article_id: articleId, published_at: time, reviewed_at: time }, prefer: "return=minimal" });
  console.log(`已自动发布随手拍：${title}`);
  return true;
}

async function fixIceCategories() {
  const rows = await rest("articles", { query: { select: "id,title,summary,content,category_name,topic_key,source_platform", status: "eq.published", order: "created_at.desc", limit: "500" } });
  let changed = 0;
  for (const article of Array.isArray(rows) ? rows : []) {
    const text = `${article.title || ""} ${article.summary || ""} ${article.content || ""}`;
    const isIce = article.topic_key === "ice" || article.source_platform === "user_report" || /\b(?:ICE|ERO|HSI|CBP)\b|移民执法|拘留|逮捕|遣返|驱逐/.test(text);
    if (isIce && article.category_name === "移民美国") {
      await rest("articles", { method: "PATCH", query: { id: `eq.${article.id}` }, body: { category_name: "驱逐快报", topic_key: "ice", updated_at: new Date().toISOString() }, prefer: "return=minimal" });
      changed += 1;
    }
  }
  console.log(`已纠正ICE错误栏目 ${changed} 条`);
}

async function main() {
  requireEnv();
  await fixIceCategories();
  const rows = await rest("ice_user_reports", { query: { select: "*", status: "in.(draft,reviewing)", order: "created_at.asc", limit: String(LIMIT) } });
  let published = 0;
  for (const report of Array.isArray(rows) ? rows : []) {
    try { if (await publishReport(report)) published += 1; } catch (error) { console.error(`自动发布失败 ${report.id}:`, error.message); }
  }
  console.log(`本轮自动发布用户随手拍 ${published} 条`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
