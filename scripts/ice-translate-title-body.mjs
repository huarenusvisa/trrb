#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";

const VERSION = "zh-title-body-v4-300-800-image";
const REQUIRED = ["OPENAI_API_KEY", "OPENAI_MODEL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function safeText(value, max = 30000) { return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max); }
function safeJson(value, fallback = {}) { if (value && typeof value === "object") return value; try { return JSON.parse(String(value || "")); } catch { return fallback; } }
function nowIso() { return new Date().toISOString(); }
function intEnv(name, fallback, min = 1, max = 500) { const value = Number(process.env[name] ?? fallback); return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback; }
function requireEnvironment() { const missing = REQUIRED.filter((name) => !process.env[name]); if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`); }
async function readJson(response) { const text = await response.text(); if (!text) return null; try { return JSON.parse(text); } catch { return { raw: text }; } }
async function request(url, options = {}) { const response = await fetch(url, options); const body = await readJson(response); if (!response.ok) throw new Error(body?.message || body?.details || body?.error?.message || body?.error || body?.raw || `${response.status}`); return body; }
function headers(prefer = "") { return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }; }
async function sb(table, { method = "GET", query = {}, body, prefer = "" } = {}) { const base = String(process.env.SUPABASE_URL || "").replace(/\/+$/, ""); const url = new URL(`${base}/rest/v1/${table}`); for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value)); return request(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) }); }
function responseText(response) { if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim(); for (const item of response?.output || []) for (const part of item?.content || []) if (part?.type === "output_text" && typeof part.text === "string") return part.text.trim(); return ""; }
function hasChinese(value) { return /[\u3400-\u9fff]/u.test(String(value || "")); }
function chineseRatio(value) { const text = String(value || "").replace(/\s+/g, ""); if (!text) return 0; const count = (text.match(/[\u3400-\u9fff]/gu) || []).length; return count / Array.from(text).length; }
function titleLength(value) { return Array.from(String(value || "").replace(/[\s，。！？、：；“”‘’【】《》]/g, "")).length; }
function bodyLength(value) { return Array.from(String(value || "").replace(/\s+/g, "")).length; }
function sourceText(value) { return safeText(value, 30000).replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim(); }
export function targetLength(sourceLength) { return Number(sourceLength || 0) < 300 ? { min: 300, max: 360, band: "300字" } : { min: 500, max: 800, band: "500-800字" }; }
function fitTitle(value) {
  let title = safeText(value, 100).replace(/[。！？!?]+$/g, "").trim();
  if (titleLength(title) > 25) title = Array.from(title).slice(0, 25).join("").replace(/[，、：；]$/g, "");
  if (titleLength(title) < 12) title = `${title}ICE执法最新动态`.slice(0, 25);
  return title;
}
function needsTranslation(story, sourceLength = 0, mediaCount = 0) { const payload = safeJson(story.ai_payload, {}); const content = safeText(story.content || story.summary, 30000); const target = targetLength(sourceLength || payload.source_character_count || 0); return payload.translation_version !== VERSION || !hasChinese(story.title) || titleLength(story.title) < 12 || titleLength(story.title) > 25 || !hasChinese(content) || chineseRatio(content) < 0.45 || bodyLength(content) < target.min || bodyLength(content) > target.max || (mediaCount > 0 && payload.image_grounding_used !== true); }

const SCHEMA = { type: "object", additionalProperties: false, required: ["title", "summary", "content", "source_language", "image_observations", "appears_old_news", "old_news_reason"], properties: { title: { type: "string" }, summary: { type: "string" }, content: { type: "string" }, source_language: { type: "string", enum: ["en", "zh", "mixed", "unknown"] }, image_observations: { type: "string" }, appears_old_news: { type: "boolean" }, old_news_reason: { type: "string" } } };

function mediaUrls(posts) { const seen = new Set(); return posts.flatMap((post) => { const media = safeJson(post.media, post.media || []); return (Array.isArray(media) ? media : []).flatMap((item) => { const url = safeText(item?.url || item?.preview_image_url, 2000); if (!/^https:\/\//i.test(url) || seen.has(url)) return []; seen.add(url); return [url]; }); }).slice(0, 4); }
function sourceLengthFromPosts(posts) { return Math.max(0, ...posts.map((post) => sourceText(post.source_text).length)); }

async function translate(story, posts, attempt = 0, previous = null) {
  const sourceLength = sourceLengthFromPosts(posts);
  const target = targetLength(sourceLength);
  const images = mediaUrls(posts);
  const response = await request("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      instructions: [
        "你是唐人日报ICE实时新闻编辑。",
        "完整阅读系统提供的事件正文、摘要及全部来源原帖后再写稿，不得只改写标题。",
        "所有输出必须使用简体中文，ICE、DHS、ERO、HSI等机构缩写及必要的人名英文拼写可以保留。",
        "只根据来源材料陈述事实，不补充未经提供的外部资料，不把观点、指控或单方说法写成已证实事实。",
        "官方账号使用‘ICE表示’‘DHS通报’等归因；媒体使用‘据该媒体报道’；个人账号使用‘该账号称’。",
        "title必须为12至25个中文字符，准确包含最重要的地点、人物或机构、人数及核心动作；不得使用震惊、炸裂、横扫、铁腕等煽动词。",
        "summary为45至90个中文字符。",
        `content为可直接发布的中文新闻正文，必须为${target.min}至${target.max}个中文字符；优先写明时间、地点、人物、机构、事件经过、人数及来源归因。`,
        "字数只能来自来源文字和图片中可核对的事实，禁止用提醒、呼吁、空泛评价、重复句、免责声明或模型记忆中的背景凑字。",
        "如有图片，必须逐张读取可辨认的文字、人物、地点、标志、物件、数量、颜色和动作，并以‘画面可见’或‘图片文字显示’明确归因；看不清不写。视频仅按静态缩略图处理。",
        "不得根据外貌推断身份、职业、族群、健康、犯罪倾向或动机。",
        "判断是否为旧闻：只有来源明确写出过去日期、周年、回顾、旧视频或旧照片时appears_old_news才为true，并在old_news_reason写明证据；不得凭模型记忆判断。",
        "image_observations用中文概括实际读到的画面信息；无图或无可辨信息则留空。",
        previous ? `上一版未通过中文或字数检查，请完整重写，禁止用套话凑字。上一版正文：${safeText(previous.content, 3000)}` : "",
        "不得添加评论、立场、免责声明、标签或SEO关键词。"
      ].filter(Boolean).join("\n"),
      input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({ current_story: { title: story.title || "", summary: story.summary || "", content: story.content || "", event_type: story.event_type || "other" }, source_character_count: sourceLength, target, sources: posts.slice(0, 20).map((post) => ({ username: post.source_username || "", display_name: post.source_display_name || "", source_type: post.source_type || "", created_at: post.source_created_at || "", text: post.source_text || "", location_text: post.location_text || "", city: post.city || "", state_code: post.state_code || "" })) }) }, ...images.map((image_url) => ({ type: "input_image", image_url, detail: "high" }))] }],
      max_output_tokens: 2200,
      text: { format: { type: "json_schema", name: "ice_chinese_title_body", strict: true, schema: SCHEMA } }
    })
  });
  const parsed = safeJson(responseText(response), null);
  if (!parsed) throw new Error("OpenAI未返回可解析的中文标题和正文");
  const parsedContent = safeText(parsed.content, 30000);
  const parsedLength = bodyLength(parsedContent);
  if ((!hasChinese(parsedContent) || chineseRatio(parsedContent) < 0.45 || parsedLength < target.min || parsedLength > target.max) && attempt < 3) return translate(story, posts, attempt + 1, parsed);
  return { ...parsed, sourceLength, target, imageCount: images.length };
}
async function storiesToTranslate() { const rows = await sb("ice_stories", { query: { select: "*", status: "in.(collecting,pending_review,pending_corroboration,approved)", order: "updated_at.desc", limit: String(intEnv("ICE_TRANSLATE_MAX_STORIES", 120, 1, 300)) } }); return Array.isArray(rows) ? rows : []; }
async function postsFor(story) { const rows = await sb("ice_posts", { query: { select: "id,x_post_id,x_url,source_username,source_display_name,source_type,source_created_at,source_text,location_text,city,state_code,processing_status,media", event_fingerprint: `eq.${story.event_fingerprint}`, processing_status: "neq.irrelevant", order: "trust_tier.asc,source_created_at.desc", limit: "30" } }); return (Array.isArray(rows) ? rows : []).filter((post) => safeText(post.source_text, 10000)); }
async function patchStory(story, translated, posts) {
  const payload = safeJson(story.ai_payload, {});
  const title = fitTitle(translated.title);
  const summary = safeText(translated.summary, 1200);
  const content = safeText(translated.content, 30000);
  const length = bodyLength(content);
  if (!title || !content || !hasChinese(title) || !hasChinese(content) || titleLength(title) < 12 || titleLength(title) > 25) throw new Error("中文标题不符合12至25字或正文为空");
  if (chineseRatio(content) < 0.45) throw new Error("正文中文比例不足，禁止进入发布流程");
  if (length < translated.target.min || length > translated.target.max) throw new Error(`中文正文${length}字，未达到${translated.target.min}-${translated.target.max}字`);
  await sb("ice_stories", { method: "PATCH", query: { id: `eq.${story.id}` }, body: { title, summary: summary || content.slice(0, 180), content, final_title: title, final_summary: summary || content.slice(0, 180), final_content: content, ai_payload: { ...payload, translation_version: VERSION, translated_at: nowIso(), translated_source_count: posts.length, translated_to_chinese: true, source_language: translated.source_language || "unknown", title_length: titleLength(title), body_character_count: length, source_character_count: translated.sourceLength, target_min_chars: translated.target.min, target_max_chars: translated.target.max, image_grounding_used: translated.imageCount > 0, image_count: translated.imageCount, image_observations: safeText(translated.image_observations, 2000), appears_old_news: Boolean(translated.appears_old_news), old_news_reason: safeText(translated.old_news_reason, 1000), old_news_checked: true }, updated_at: nowIso() }, prefer: "return=minimal" });
}
async function main() {
  requireEnvironment();
  const stories = await storiesToTranslate();
  let translatedCount = 0, skipped = 0;
  for (const story of stories) {
    if (story.reviewed_at || ["editing", "approved", "rejected"].includes(story.human_review_status)) { skipped += 1; continue; }
    const posts = await postsFor(story);
    if (!posts.length) { skipped += 1; continue; }
    if (!needsTranslation(story, sourceLengthFromPosts(posts), mediaUrls(posts).length)) { skipped += 1; continue; }
    try { const translated = await translate(story, posts); await patchStory(story, translated, posts); translatedCount += 1; console.log(`已生成12至25字标题及中文正文：${story.id}｜${fitTitle(translated.title)}`); }
    catch (error) { console.error(`ICE中文编辑失败 ${story.id}:`, error.message || error); }
  }
  console.log(JSON.stringify({ stage: VERSION, checked: stories.length, translated: translatedCount, skipped }));
}
export { hasChinese, chineseRatio, needsTranslation, fitTitle, titleLength, bodyLength, sourceLengthFromPosts, mediaUrls };
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error("ICE中文标题正文处理失败：", error); process.exitCode = 1; });
