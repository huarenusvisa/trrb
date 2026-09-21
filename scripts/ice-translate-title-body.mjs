#!/usr/bin/env node
import process from "node:process";
import { fileURLToPath } from "node:url";

const VERSION = "zh-title-body-v10-official-context-flex-300-1500";
const ACCEPTED_VERSIONS = new Set([VERSION]);
const CONTEXT_EXPANSION_VERSION = "ice-verified-context-v2";
const VERIFIED_ICE_EDITORIAL_CONTEXT = Object.freeze({
  agency_role: [
    "ICE隶属美国国土安全部。ERO负责在美国境内识别、拘捕、羁押并在具备法律条件时递解可被递解的非公民；HSI侧重跨境犯罪调查。报道必须区分ERO与HSI。",
    "拘捕、羁押、进入移民程序和实际递解是不同阶段。仅有被拘留或传出遣返消息，不能自动证明已有最终递解令，也不能证明已经离境。"
  ],
  enforcement_process: [
    "ICE执法可能涉及移民身份违法、最终递解令、恢复既有递解令、刑事案件移交或其他移民法依据；具体到个人时，只能采用信源明确说明的法律依据。",
    "实际递解通常还涉及可执行的法律命令、旅行证件、接收国协调及个案程序。不得把一般流程写成当事人已经经历的事实。"
  ],
  attribution_rules: [
    "地点只可用于解释已确认的州、市、现场或负责地区；不得虚构抓捕地点、拘留设施、行动规模或现场经过。",
    "国籍只可在信源明确记载时写入，并可用于解释旅行证件与接收国协调背景；不得根据姓名、外貌或语言推断国籍、身份或移民状态。",
    "政策背景只能作为单独标明的通用背景，不得代替个案证据；单一来源或未获官方证实的说法必须持续明确归因。"
  ]
});
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
function parseResponse(response) {
  const text = responseText(response);
  if (!text) return null;
  const candidates = [text, text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")];
  const first = text.indexOf("{"); const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const value of candidates) { const parsed = safeJson(value, null); if (parsed) return parsed; }
  return null;
}
function hasChinese(value) { return /[\u3400-\u9fff]/u.test(String(value || "")); }
function chineseRatio(value) { const text = String(value || "").replace(/\s+/g, ""); if (!text) return 0; const count = (text.match(/[\u3400-\u9fff]/gu) || []).length; return count / Array.from(text).length; }
function chineseCharCount(value) { return (String(value || "").match(/[\u3400-\u9fff]/gu) || []).length; }
function titleLength(value) { return Array.from(String(value || "").replace(/[\s，。！？、：；“”‘’【】《》]/g, "")).length; }
function bodyLength(value) { return chineseCharCount(value); }
function sourceText(value) { return safeText(value, 30000).replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim(); }
function fitTitle(value) {
  return safeText(value, Infinity).replace(/[。！？!?]+$/g, "").trim();
}
function needsTranslation(story, sourceLength = 0, mediaCount = 0) {
  const payload = safeJson(story.ai_payload, {});
  const content = safeText(story.content || story.summary, Infinity);
  return !ACCEPTED_VERSIONS.has(payload.translation_version)
    || payload.translated_to_chinese !== true
    || !hasChinese(story.title) || !hasChinese(content) || chineseRatio(content) < 0.45
    || (mediaCount > 0 && payload.image_grounding_used !== true);
}

function schemaFor() {
  return { type: "object", additionalProperties: false,
    required: ["title", "summary", "content", "source_language", "image_observations", "appears_old_news", "old_news_reason"],
    properties: {
      title: { type: "string" }, summary: { type: "string" }, content: { type: "string" },
      source_language: { type: "string", enum: ["en", "zh", "mixed", "unknown"] },
      image_observations: { type: "string" }, appears_old_news: { type: "boolean" }, old_news_reason: { type: "string" }
    }
  };
}

function mediaUrls(posts) { const seen = new Set(); return posts.flatMap((post) => { const media = safeJson(post.media, post.media || []); return (Array.isArray(media) ? media : []).flatMap((item) => { const url = safeText(item?.url || item?.preview_image_url, 2000); if (!/^https:\/\//i.test(url) || seen.has(url)) return []; seen.add(url); return [url]; }); }).slice(0, 4); }
function sourceLengthFromPosts(posts) { return Math.max(0, ...posts.map((post) => sourceText(post.source_text).length)); }
function editorialBand(posts, sourceLength = sourceLengthFromPosts(posts), imageCount = mediaUrls(posts).length) {
  const distinctSources = new Set(posts.map((post) => String(post.source_username || post.source_display_name || "").toLowerCase()).filter(Boolean)).size;
  const rich = sourceLength >= 900 || distinctSources >= 3 || imageCount >= 2;
  return rich
    ? { min: 300, preferredMin: 800, max: 1500, policy: "verified-rich-context-prefer-800-1500" }
    : { min: 300, preferredMin: 300, max: 800, policy: "verified-brief-context-300-800" };
}

async function translate(story, posts, attempt = 0) {
  const sourceLength = sourceLengthFromPosts(posts);
  const images = mediaUrls(posts);
  const band = editorialBand(posts, sourceLength, images.length);
  const response = await request("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      instructions: [
        "你是唐人日报美国官方信息与公共安全编辑，可处理ICE/DHS/ERO/HSI执法、USCIS移民政策、FBI/司法部刑事案件和美国公共政策。",
        "完整阅读系统提供的事件正文、摘要及全部来源原帖后再写稿，不得只改写标题。",
        "所有输出必须使用简体中文，ICE、DHS、ERO、HSI等机构缩写及必要的人名英文拼写可以保留。",
        "个案事实只能来自来源文字和图片，不把观点、指控或单方说法写成已证实事实；先串联同一事件的全部来源，补足前因、行动主体、地点、程序阶段及后续状态。只有内容明确涉及ICE、ERO或HSI执法时，才可使用input中verified_editorial_background提供的ICE制度背景，并且必须明确写成背景说明，不能写成当事人的既成事实；USCIS政策、FBI刑事案件和美国时政稿不得硬套ICE背景。",
        "官方账号使用‘ICE表示’‘DHS通报’等归因；媒体使用‘据该媒体报道’；个人账号使用‘该账号称’。",
        "title准确概括已知事实，包含最重要的地点、人物或机构及核心动作，不设字数上下限；不得使用震惊、炸裂、横扫、铁腕等煽动词。",
        "summary简明概括事件，不设字数上下限。",
        `content为可直接发布的中文新闻正文，按纯中文汉字计算必须在${band.min}至${band.max}字之间，英文、数字、空格和标点不计入字数；如实保留来源能够支持的时间、地点、人物、机构、事件经过、人数及来源归因。`,
        band.preferredMin > band.min ? `本事件可用来源或上下文较丰富，在不重复、不虚构的前提下优先扩写到${band.preferredMin}至${band.max}字；若可核实信息不足，写满${band.min}字即可，不得为了达到优选长度而凑字。` : "普通快讯以300至800个纯中文汉字完整交代已核实事实。",
        `普通快讯写成3至6个自然段，信息充分的重点稿写成5至8个自然段；每段围绕一个完整信息点，减少连续短句和频繁句号，多用逗号组织完整复句，但不得为凑字重复表达。`,
        "字数只能来自来源文字、图片中可核对的事实和verified_editorial_background。禁止用提醒、呼吁、空泛评价、重复句、免责声明或模型记忆凑字；不得虚构抓捕现场、法律文书、犯罪记录、移民身份、国籍、拘留地点或递解结果。",
        "如有图片，必须逐张读取可辨认的文字、人物、地点、标志、物件、数量、颜色和动作，并以‘画面可见’或‘图片文字显示’明确归因；看不清不写。视频仅按静态缩略图处理。",
        "不得根据外貌推断身份、职业、族群、健康、犯罪倾向或动机。",
        `当前日期为${new Date().toISOString().slice(0, 10)}。判断是否为旧闻：只依据来源中明确出现的事件日期、周年、回顾、旧视频或旧照片；事件发生时间明显早于当前报道且没有实质新进展时，appears_old_news必须为true，并在old_news_reason写明来源中的日期证据；不得凭模型记忆判断。`,
        "image_observations用中文概括实际读到的画面信息；无图或无可辨信息则留空。",
        "不得添加评论、立场、免责声明、标签或SEO关键词。"
      ].filter(Boolean).join("\n"),
      input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({ current_story: { title: story.title || "", summary: story.summary || "", content: story.content || "", event_type: story.event_type || "other" }, source_character_count: sourceLength, target_chinese_character_range: [band.min, band.max], context_expansion_version: CONTEXT_EXPANSION_VERSION, verified_editorial_background: VERIFIED_ICE_EDITORIAL_CONTEXT, sources: posts.slice(0, 20).map((post) => ({ username: post.source_username || "", display_name: post.source_display_name || "", source_type: post.source_type || "", trust_tier: post.trust_tier ?? null, created_at: post.source_created_at || "", text: post.source_text || "", location_text: post.location_text || "", city: post.city || "", state_code: post.state_code || "" })) }) }, ...images.map((image_url) => ({ type: "input_image", image_url, detail: "high" }))] }],
      max_output_tokens: band.max > 800 ? 3600 : 2200,
      text: { format: { type: "json_schema", name: "ice_chinese_title_body", strict: true, schema: schemaFor() } }
    })
  });
  const parsed = parseResponse(response);
  if (!parsed) {
    if (attempt < 5) return translate(story, posts, attempt + 1);
    throw new Error("OpenAI连续6次未返回可解析的中文标题和正文");
  }
  const parsedContent = safeText(parsed.content, Infinity);
  const count = chineseCharCount(parsedContent);
  if ((!hasChinese(parsed.title) || !hasChinese(parsedContent) || chineseRatio(parsedContent) < 0.45 || count < band.min || count > band.max) && attempt < 3) return translate(story, posts, attempt + 1);
  if (count < band.min || count > band.max) throw new Error(`正文纯中文汉字${count}字，不符合${band.min}至${band.max}字发布标准`);
  return { ...parsed, sourceLength, imageCount: images.length, targetMin: band.min, preferredMin: band.preferredMin, targetMax: band.max, lengthPolicy: band.policy };
}
async function storiesToTranslate() { const rows = await sb("ice_stories", { query: { select: "*", status: "in.(collecting,pending_review,pending_corroboration,approved)", order: "updated_at.desc", limit: String(intEnv("ICE_TRANSLATE_MAX_STORIES", 120, 1, 300)) } }); return Array.isArray(rows) ? rows : []; }
async function postsFor(story) { const rows = await sb("ice_posts", { query: { select: "id,x_post_id,x_url,source_username,source_display_name,source_type,trust_tier,source_created_at,source_text,location_text,city,state_code,processing_status,media", event_fingerprint: `eq.${story.event_fingerprint}`, processing_status: "neq.irrelevant", order: "trust_tier.asc,source_created_at.desc", limit: "30" } }); return (Array.isArray(rows) ? rows : []).filter((post) => safeText(post.source_text, 10000)); }
async function patchStory(story, translated, posts) {
  const payload = safeJson(story.ai_payload, {});
  const title = fitTitle(translated.title);
  const summary = safeText(translated.summary, 1200);
  const content = safeText(translated.content, Infinity);
  const length = bodyLength(content);
  const band = editorialBand(posts, translated.sourceLength, translated.imageCount);
  const targetMin = Number(translated.targetMin || band.min);
  const targetMax = Number(translated.targetMax || band.max);
  if (!title || !content || !hasChinese(title) || !hasChinese(content)) throw new Error("标题和正文必须为非空中文");
  if (chineseRatio(content) < 0.45) throw new Error("正文中文比例不足，禁止进入发布流程");
  if (length < targetMin || length > targetMax) throw new Error(`正文纯中文汉字${length}字，不符合${targetMin}至${targetMax}字发布标准`);
  const appearsOldNews = Boolean(translated.appears_old_news);
  await sb("ice_stories", { method: "PATCH", query: { id: `eq.${story.id}` }, body: { title, summary: summary || content.slice(0, 180), content, final_title: title, final_summary: summary || content.slice(0, 180), final_content: content, ai_payload: { ...payload, translation_version: VERSION, context_expansion_version: CONTEXT_EXPANSION_VERSION, translated_at: nowIso(), translated_source_count: posts.length, translated_to_chinese: true, source_language: translated.source_language || "unknown", title_length: titleLength(title), body_character_count: length, body_chinese_character_count: length, source_character_count: translated.sourceLength, target_min_chars: targetMin, preferred_min_chars: Number(translated.preferredMin || band.preferredMin), target_max_chars: targetMax, length_policy: translated.lengthPolicy || band.policy, image_grounding_used: translated.imageCount > 0, image_count: translated.imageCount, image_observations: safeText(translated.image_observations, 2000), appears_old_news: appearsOldNews, old_news_reason: safeText(translated.old_news_reason, 1000), old_news_checked: true, automatic_old_news_check_passed: !appearsOldNews, manual_old_news_confirmation: false }, updated_at: nowIso() }, prefer: "return=minimal" });
}
async function main() {
  requireEnvironment();
  const stories = await storiesToTranslate();
  let translatedCount = 0, skipped = 0, failed = 0;
  for (const story of stories) {
    if (["editing", "approved", "rejected"].includes(story.human_review_status)) { skipped += 1; continue; }
    const posts = await postsFor(story);
    if (!posts.length) { skipped += 1; continue; }
    if (!needsTranslation(story, sourceLengthFromPosts(posts), mediaUrls(posts).length)) { skipped += 1; continue; }
    try { const translated = await translate(story, posts); await patchStory(story, translated, posts); translatedCount += 1; console.log(`已生成中文标题及正文：${story.id}｜${fitTitle(translated.title)}`); }
    catch (error) { failed += 1; console.error(`ICE中文编辑失败 ${story.id}:`, error.message || error); }
  }
  console.log(JSON.stringify({ stage: VERSION, checked: stories.length, translated: translatedCount, skipped, failed }));
}
export { hasChinese, chineseRatio, chineseCharCount, needsTranslation, fitTitle, titleLength, bodyLength, sourceLengthFromPosts, mediaUrls, editorialBand, schemaFor, translate, patchStory };
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error("ICE中文标题正文处理失败：", error); process.exitCode = 1; });
