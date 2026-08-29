#!/usr/bin/env node
import crypto from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";

const X_API = "https://api.x.com/2";
const PIPELINE = "trump-x-v2-chinese-editor";
const LOOKBACK_HOURS = intEnv("TRUMP_X_LOOKBACK_HOURS", 168, 3, 168);
const MAX_FETCH = intEnv("TRUMP_X_MAX_FETCH", 100, 10, 100);
const MAX_PROCESS = intEnv("TRUMP_X_MAX_PROCESS", 50, 1, 300);
const PROCESS_CONCURRENCY = intEnv("TRUMP_X_PROCESS_CONCURRENCY", 5, 1, 8);
const OPENAI_MODEL = clean(process.env.OPENAI_MODEL || "gpt-5-mini", 100);
const REQUIRED = ["X_BEARER_TOKEN", "OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const OFFICIAL_HANDLE = "realDonaldTrump";
const OFFICIAL_HANDLES = /^realdonaldtrump$/i;
let officialPublishLock = Promise.resolve();

function intEnv(name, fallback, min, max) { const value = Number(process.env[name] ?? fallback); return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback; }
function clean(value, max = 30_000) { return String(value ?? "").normalize("NFKC").replace(/\u0000/g, "").trim().slice(0, max); }
function sourceText(value) { return clean(value).replace(/https?:\/\/\S+/gi, " ").replace(/(?:^|\s)@[A-Za-z0-9_]+/g, " ").replace(/\s+/g, " ").trim(); }
function hasChinese(value) { return /[\u3400-\u9fff]/u.test(String(value || "")); }
function chineseRatio(value) { const text = String(value || "").replace(/\s+/g, ""); return text ? (text.match(/[\u3400-\u9fff]/gu) || []).length / Array.from(text).length : 0; }
function charLength(value) { return Array.from(String(value || "").replace(/\s+/g, "")).length; }
export function targetLength(value) { return sourceText(value).length < 300 ? { min: 300, max: 600, band: "300-600字" } : { min: 500, max: 800, band: "500-800字" }; }
export function isInformational(value, account = "") { const text = sourceText(value); const words = text.match(/[A-Za-z0-9]+|[\u3400-\u9fff]/gu) || []; return isOfficialTrumpAccount(account) && text.length >= 20 && words.length >= 5 && !/^@/u.test(clean(value)); }
export function isOfficialTrumpAccount(value) { return OFFICIAL_HANDLES.test(clean(value, 100).replace(/^@/, "")); }
function requireEnvironment() { const missing = REQUIRED.filter((name) => !process.env[name]); if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`); }
function headers(prefer = "") { return { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) }; }
async function readJson(response) { const text = await response.text(); if (!text) return null; try { return JSON.parse(text); } catch { return { raw: text }; } }
async function request(url, options = {}, timeoutMs = 60_000) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { const response = await fetch(url, { ...options, signal: controller.signal }); const body = await readJson(response); if (!response.ok) throw new Error(`${options.method || "GET"} ${url} → ${response.status}: ${body?.detail || body?.title || body?.message || body?.error?.message || body?.raw || "未知错误"}`); return body; } finally { clearTimeout(timer); } }
async function supabase(table, { method = "GET", query = {}, body, prefer = "" } = {}) { const url = new URL(`${String(process.env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1/${table}`); for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value)); return request(url, { method, headers: headers(prefer), body: body === undefined ? undefined : JSON.stringify(body) }); }
function responseText(response) { if (typeof response?.output_text === "string") return response.output_text.trim(); for (const item of response?.output || []) for (const part of item?.content || []) if (part?.type === "output_text") return String(part.text || "").trim(); return ""; }

function mediaFrom(tweet, includes) { const byKey = new Map((includes?.media || []).map((item) => [item.media_key, item])); return (tweet?.attachments?.media_keys || []).map((key) => byKey.get(key)).filter(Boolean).map((item) => ({ type: item.type || "", url: item.url || "", preview_image_url: item.preview_image_url || "", width: item.width || null, height: item.height || null, duration_ms: item.duration_ms || null, variants: Array.isArray(item.variants) ? item.variants : [] })); }
function visualInputs(media) { const seen = new Set(); return (Array.isArray(media) ? media : []).flatMap((item) => { const url = clean(item?.url || item?.preview_image_url, 2_000); if (!/^https:\/\//i.test(url) || seen.has(url)) return []; seen.add(url); return [{ type: "input_image", image_url: url, detail: "high" }]; }).slice(0, 4); }

export function buildCandidate(tweet, author = {}, media = [], collectedAt = new Date().toISOString()) {
  const id = clean(tweet?.id, 100); const username = clean(author?.username || "unknown", 100).replace(/^@/, ""); const text = clean(tweet?.text); const target = targetLength(text);
  return { external_id: `x:trump:${id}`, pipeline: PIPELINE, source_url: username === "unknown" ? `https://x.com/i/web/status/${id}` : `https://x.com/${encodeURIComponent(username)}/status/${id}`, source_account: `@${username}`, source_name: clean(author?.name || username, 200), source_level: isOfficialTrumpAccount(username) ? "official" : author?.verified ? "verified_social" : "social_monitor", raw_text: text, raw_payload: { tweet_id: id, source_created_at: tweet?.created_at || collectedAt, lang: tweet?.lang || "", public_metrics: tweet?.public_metrics || {}, author: { id: author?.id || "", username, name: author?.name || "", verified: Boolean(author?.verified) }, media }, ai_payload: { status: "queued_for_chinese_edit", proposed_title: clean(sourceText(text), 120), topic_key: "trump", target_min_chars: target.min, target_max_chars: target.max, source_character_count: sourceText(text).length, translation_required: true, image_reading_required: media.length > 0, official_source: isOfficialTrumpAccount(username) }, proposed_section: "特朗普专题", confidence: 80, decision: "processing", decision_reason: "特朗普X资讯，正在自动翻译、读图、查重并编辑中文稿", collected_at: collectedAt, created_at: collectedAt, updated_at: collectedAt };
}

function xHeaders() { return { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }; }
function addTweetFields(url, includeAuthor = true) {
  url.searchParams.set("tweet.fields", "id,text,author_id,created_at,lang,public_metrics,possibly_sensitive,attachments,conversation_id,referenced_tweets");
  url.searchParams.set("expansions", includeAuthor ? "author_id,attachments.media_keys" : "attachments.media_keys");
  if (includeAuthor) url.searchParams.set("user.fields", "id,name,username,verified,public_metrics");
  url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height,duration_ms,variants");
}
async function collectFromTimeline() {
  const profileUrl = new URL(`${X_API}/users/by/username/${OFFICIAL_HANDLE}`);
  profileUrl.searchParams.set("user.fields", "id,name,username,verified,public_metrics");
  const profile = await request(profileUrl, { headers: xHeaders() }, 30_000);
  if (!profile?.data?.id) throw new Error("X官方账号查询没有返回用户ID");
  const url = new URL(`${X_API}/users/${profile.data.id}/tweets`);
  url.searchParams.set("exclude", "replies,retweets");
  url.searchParams.set("max_results", String(MAX_FETCH));
  url.searchParams.set("start_time", new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString());
  addTweetFields(url, false);
  const payload = await request(url, { headers: xHeaders() }, 30_000);
  return { ...payload, includes: { ...(payload?.includes || {}), users: [profile.data] }, collection_mode: "official_user_timeline" };
}
async function collectFromSearch() {
  const url = new URL(`${X_API}/tweets/search/recent`);
  url.searchParams.set("query", `from:${OFFICIAL_HANDLE} -is:retweet -is:reply`);
  url.searchParams.set("max_results", String(MAX_FETCH));
  url.searchParams.set("start_time", new Date(Date.now() - Math.min(LOOKBACK_HOURS, 168) * 3_600_000).toISOString());
  url.searchParams.set("sort_order", "recency");
  addTweetFields(url, true);
  const payload = await request(url, { headers: xHeaders() }, 30_000);
  return { ...payload, collection_mode: "recent_search_fallback" };
}
async function collect() {
  try { return await collectFromTimeline(); }
  catch (timelineError) {
    console.warn(`特朗普X官方账号时间线接口失败，改用搜索接口：${clean(timelineError?.message || timelineError, 600)}`);
    const fallback = await collectFromSearch();
    return { ...fallback, timeline_error: clean(timelineError?.message || timelineError, 600) };
  }
}
async function existingExternalIds(ids) { if (!ids.length) return new Set(); const rows = await supabase("news_candidates", { query: { select: "external_id", external_id: `in.(${ids.map((id) => `\"x:trump:${id}\"`).join(",")})`, limit: String(ids.length) } }); return new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.external_id))); }
async function pendingCandidates() { const rows = await supabase("news_candidates", { query: { select: "*", pipeline: "like.trump-x-v%", decision: "in.(pending_review,processing,review_required,failed)", order: "created_at.asc", limit: String(MAX_PROCESS) } }); return Array.isArray(rows) ? rows : []; }
async function patchCandidate(id, body) { await supabase("news_candidates", { method: "PATCH", query: { id: `eq.${id}` }, body: { ...body, updated_at: new Date().toISOString() }, prefer: "return=minimal" }); }
async function archiveNonOfficialCandidates() {
  const rows = await supabase("news_candidates", { query: { select: "id,source_account,decision", pipeline: "like.trump-x-v%", decision: "not.in.(deleted,rejected)", order: "created_at.asc", limit: "1000" } });
  const ids = (Array.isArray(rows) ? rows : []).filter((row) => !isOfficialTrumpAccount(row.source_account)).map((row) => row.id);
  for (let index = 0; index < ids.length; index += 100) await supabase("news_candidates", { method: "PATCH", query: { id: `in.(${ids.slice(index, index + 100).join(",")})` }, body: { decision: "rejected", decision_reason: "不属于特朗普本人@realDonaldTrump发布的内容，已移出特朗普内容池", updated_at: new Date().toISOString() }, prefer: "return=minimal" });
  return ids.length;
}

function articleSchema(target) { const schemaMin = target.min === 300 ? 380 : 550; return { type: "object", additionalProperties: false, required: ["title", "summary", "content", "seo_keywords", "image_observations", "appears_old_news", "old_news_reason"], properties: { title: { type: "string", minLength: 8, maxLength: 100 }, summary: { type: "string", minLength: 50, maxLength: 180 }, content: { type: "string", minLength: schemaMin, maxLength: target.max }, seo_keywords: { type: "string", minLength: 3, maxLength: 180 }, image_observations: { type: "string" }, appears_old_news: { type: "boolean" }, old_news_reason: { type: "string" } } }; }
async function generateChineseDraft(candidate, attempt = 0, previous = null) {
  const raw = sourceText(candidate.raw_text); const media = candidate?.raw_payload?.media || []; const images = visualInputs(media); const target = targetLength(raw);
  const response = await request("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: OPENAI_MODEL, store: false, max_output_tokens: 2200, instructions: ["你是唐人日报特朗普专题编辑。所有字段必须使用简体中文；原文为英文时必须完整翻译和编辑，禁止输出完整英文句子。人名可保留常用英文拼写，ICE、DHS等缩写可保留。", `正文必须为${target.min}至${target.max}个中文字符。只依据原帖文字和图片可见信息写作，严禁编造人物、数字、地点、引语、原因、结果或外部背景。`, target.min === 300 ? "正文优先扩写到420至560个字符；可依据原帖前后语境补全事件顺序、发言归因、人物关系和图片中可核对的细节，但不得编造原帖之外的事实。" : "为避免中英文空格造成计数偏差，正文请写到550至750个字符。", "对观点、指控和预测明确归因于发帖账号，不得写成已证实事实。过滤辱骂、口号、纯立场表达和缺乏新闻事实的评论。", "如有图片，必须逐张读取可辨认的文字、人物、地点、标志、物件、数量、颜色和动作，并以‘画面可见’或‘图片文字显示’归因；看不清不写。视频只按静态缩略图处理。", "不得根据外貌推断身份、职业、族群、健康、犯罪倾向或动机。不得用提醒、呼吁、空泛评价、重复句或免责声明凑字。", "判断原帖是否明确在回顾旧事件；只有原文明确写出过去日期、周年、回顾、旧视频或旧照片时，appears_old_news才为true，并在old_news_reason说明证据。不得凭模型记忆判断。", "标题准确概括与特朗普直接相关的新闻事实；summary为60至120个中文字符；content只放正文，不用Markdown。image_observations用中文简述实际读取到的画面信息，无图或没有可辨信息则留空。", previous ? `上一版未通过中文或字数检查，请重写。上一版正文：${clean(previous.content, 3_000)}` : ""].filter(Boolean).join("\n"), input: [{ role: "user", content: [{ type: "input_text", text: `原帖账号：${candidate.source_account || "未知"}\n原帖时间：${candidate?.raw_payload?.source_created_at || "未知"}\n原帖文字：\n${raw}\n\n请翻译、读图并编辑为中文新闻稿。` }, ...images] }], text: { format: { type: "json_schema", name: "trump_x_chinese_draft", strict: true, schema: articleSchema(target) } } }) });
  const parsed = JSON.parse(responseText(response)); for (const key of ["title", "summary", "content", "seo_keywords", "image_observations", "old_news_reason"]) parsed[key] = clean(parsed[key], key === "content" ? 10_000 : 1_000); const length = charLength(parsed.content);
  if ((!hasChinese(parsed.title) || chineseRatio(parsed.content) < 0.45 || length < target.min || length > target.max) && attempt < 3) return generateChineseDraft(candidate, attempt + 1, parsed);
  if (!hasChinese(parsed.title) || chineseRatio(parsed.content) < 0.45) throw new Error("生成稿未通过中文检查，禁止发布"); if (length < target.min || length > target.max) throw new Error(`生成正文${length}字，未达到${target.min}-${target.max}字`);
  return { ...parsed, target, source_character_count: raw.length, image_grounding_used: images.length > 0, image_count: images.length };
}

function shingles(value) { const text = clean(value).toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, ""); const out = new Set(); for (let i = 0; i < text.length - 1; i += 1) out.add(text.slice(i, i + 2)); return out; }
export function similarity(a, b) { const left = shingles(a), right = shingles(b); if (!left.size || !right.size) return 0; let common = 0; for (const token of left) if (right.has(token)) common += 1; return common / (left.size + right.size - common); }
async function recentTrumpArticles() { const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString(); const rows = await supabase("articles", { query: { select: "id,title,summary,content,external_id,published_at", topic_key: "eq.trump", status: "eq.published", published_at: `gte.${cutoff}`, order: "published_at.desc", limit: "1000" } }); return Array.isArray(rows) ? rows : []; }
function duplicateArticle(draft, articles) { return articles.find((article) => similarity(`${draft.title}${draft.summary}${draft.content}`, `${article.title}${article.summary}${article.content}`) >= 0.72) || null; }
function serializeOfficialPublish(task) { const result = officialPublishLock.then(task, task); officialPublishLock = result.catch(() => {}); return result; }
function coverImage(candidate) { const media = candidate?.raw_payload?.media || []; return media.find((item) => item.type === "photo" && item.url)?.url || media.find((item) => item.preview_image_url)?.preview_image_url || ""; }
async function publishOfficial(candidate, draft) {
  const id = crypto.randomUUID(); const time = new Date().toISOString(); const postId = clean(candidate?.raw_payload?.tweet_id || candidate.external_id?.split(":").pop(), 100);
  const rows = await supabase("articles", { method: "POST", prefer: "return=representation", body: { id, title: draft.title, slug: `trump-x-${postId}`, summary: draft.summary, content: draft.content, category_name: "美国时政", cover_image: coverImage(candidate), image_alt: coverImage(candidate) ? draft.title : "", author: "唐人日报编辑部", status: "published", visibility: "public", published_at: time, created_at: time, source_url: candidate.source_url, source_name: candidate.source_name, source_account: candidate.source_account, source_level: "official", source_platform: "x", source_post_id: postId, source_created_at: candidate?.raw_payload?.source_created_at || candidate.collected_at, external_id: candidate.external_id, topic_key: "trump", primary_section: "美国时政", related_sections: ["美国时政", "特朗普专题"], review_status: "official_source_auto_published", automation_source: PIPELINE, ai_confidence: 90, seo_title: draft.title, seo_description: draft.summary, seo_keywords: draft.seo_keywords, independent_source_count: 1, supporting_sources: [], risk_flags: [], metadata: { collector: PIPELINE, automatic_publish: true, official_source_auto: true, translated_to_chinese: true, source_text_original: candidate.raw_text, source_media: candidate?.raw_payload?.media || [], source_character_count: draft.source_character_count, target_min_chars: draft.target.min, target_max_chars: draft.target.max, image_grounding_used: draft.image_grounding_used, image_count: draft.image_count, image_observations: draft.image_observations, duplicate_check_days: 30, old_news_checked: true, openai_model: OPENAI_MODEL } } });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function processCandidate(candidate, articles) {
  if (!isInformational(candidate.raw_text, candidate.source_account)) { await patchCandidate(candidate.id, { decision: "rejected", decision_reason: "不是特朗普本人原创帖，或原帖信息量不足，不进入编辑发布流程", processed_at: new Date().toISOString(), ai_payload: { ...(candidate.ai_payload || {}), status: "filtered_non_official_or_low_information" } }); return "rejected"; }
  try {
    const draft = await generateChineseDraft(candidate); const duplicate = duplicateArticle(draft, articles);
    if (draft.appears_old_news) { await patchCandidate(candidate.id, { decision: "rejected", decision_reason: `旧闻检查未通过：${draft.old_news_reason || "原帖明确为旧事件回顾"}`, processed_at: new Date().toISOString(), ai_payload: { ...draft, status: "filtered_old_news", automatic_publish_blocked: true } }); return "old_news"; }
    if (duplicate) { await patchCandidate(candidate.id, { decision: "duplicate", decision_reason: `与近30天已发布文章重复：${duplicate.id}`, article_id: duplicate.id, processed_at: new Date().toISOString(), ai_payload: { ...draft, status: "duplicate", duplicate_article_id: duplicate.id } }); return "duplicate"; }
    if (isOfficialTrumpAccount(candidate.source_account)) return serializeOfficialPublish(async () => { const currentDuplicate = duplicateArticle(draft, articles); if (currentDuplicate) { await patchCandidate(candidate.id, { decision: "duplicate", decision_reason: `与近30天已发布文章重复：${currentDuplicate.id}`, article_id: currentDuplicate.id, processed_at: new Date().toISOString(), ai_payload: { ...draft, status: "duplicate", duplicate_article_id: currentDuplicate.id } }); return "duplicate"; } const article = await publishOfficial(candidate, draft); articles.unshift({ id: article?.id, title: draft.title, summary: draft.summary, content: draft.content }); await patchCandidate(candidate.id, { decision: "published", decision_reason: "特朗普官方来源已通过翻译、读图、查重和旧闻检查并自动发布", article_id: article?.id || null, processed_at: new Date().toISOString(), ai_payload: { ...draft, status: "published", translated_to_chinese: true, official_source: true } }); return "published"; });
    await patchCandidate(candidate.id, { decision: "ready_for_review", decision_reason: "非官方来源已完成翻译、读图、查重和旧闻检查，等待人工审核", processed_at: new Date().toISOString(), ai_payload: { ...draft, status: "ready_for_review", translated_to_chinese: true, official_source: false } }); return "ready_for_review";
  } catch (error) { await patchCandidate(candidate.id, { decision: "review_required", decision_reason: `自动翻译、读图、查重或字数检查未通过：${clean(error?.message || error, 600)}；不得直接发布英文原文`, processed_at: new Date().toISOString(), ai_payload: { ...(candidate.ai_payload || {}), status: "review_required", automatic_publish_blocked: true } }); return "review_required"; }
}

export async function run() {
  requireEnvironment(); const archived_non_official = await archiveNonOfficialCandidates(); const payload = await collect(); const authors = new Map((payload?.includes?.users || []).map((user) => [String(user.id), user])); const tweets = payload?.data || []; const existing = await existingExternalIds(tweets.map((tweet) => clean(tweet.id, 100))); const collectedAt = new Date().toISOString(); const rows = tweets.filter((tweet) => !existing.has(`x:trump:${tweet.id}`)).map((tweet) => buildCandidate(tweet, authors.get(String(tweet.author_id)) || payload?.includes?.users?.[0] || {}, mediaFrom(tweet, payload?.includes), collectedAt)).filter((row) => isOfficialTrumpAccount(row.source_account)); if (rows.length) await supabase("news_candidates", { method: "POST", body: rows, prefer: "return=minimal" });
  const [queue, articles] = await Promise.all([pendingCandidates(), recentTrumpArticles()]); const counts = { published: 0, ready_for_review: 0, review_required: 0, rejected: 0, duplicate: 0, old_news: 0 }; let cursor = 0; async function worker() { while (cursor < queue.length) { const candidate = queue[cursor++]; const status = await processCandidate(candidate, articles); counts[status] += 1; } } await Promise.all(Array.from({ length: Math.min(PROCESS_CONCURRENCY, queue.length || 1) }, () => worker())); const report = { pipeline: PIPELINE, source_account: `@${OFFICIAL_HANDLE}`, collection_mode: payload?.collection_mode || "unknown", timeline_error: payload?.timeline_error || "", lookback_hours: LOOKBACK_HOURS, returned: payload?.data?.length || 0, relevant: tweets.length, archived_non_official, duplicate_collected: existing.size, inserted: rows.length, processed: queue.length, ...counts }; console.log(JSON.stringify(report, null, 2)); return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run().catch((error) => { console.error("特朗普X资讯采集编辑失败：", error); process.exitCode = 1; });
