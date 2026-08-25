#!/usr/bin/env node
import process from "node:process";
import { pathToFileURL } from "node:url";
import chinaHotHeadlines from "../netlify/functions/_shared/china-hot-headlines.js";

const { CHINA_HOT_CATEGORY, isChinaHotHeadline } = chinaHotHeadlines;
const SOURCE_HANDLE = "whyyoutouzhele";
const SOURCE_NAME = "李老师不是你老师";
const PIPELINE = "china-hot-li-teacher-v2";
const WARNING = "真实性提示：本文所述信息可能尚未获得独立核实，部分细节可能存在偏差，请以权威部门后续通报为准。";
const DRY_RUN = process.argv.includes("--dry-run");
const RECOVER_ARCHIVED = process.argv.includes("--recover-archived");
const REPAIR_TODAY = process.argv.includes("--repair-today");
const REPAIR_SINCE = cleanText(process.env.CHINA_HOT_REPAIR_SINCE || "2026-08-24T00:00:00Z", 100);
const EXPANSION_VERSION = "grounded-image-v6";
const LOOKBACK_HOURS = intEnv("LI_TEACHER_LOOKBACK_HOURS", 6, 3, 24);
const MAX_FETCH = intEnv("LI_TEACHER_MAX_FETCH", 100, 10, 200);
const MAX_PUBLISH = intEnv("LI_TEACHER_MAX_PUBLISH", RECOVER_ARCHIVED ? 150 : 20, 1, 150);
const PUBLISH_CONCURRENCY = intEnv("LI_TEACHER_PUBLISH_CONCURRENCY", 4, 1, 8);
const OPENAI_MODEL = cleanText(process.env.OPENAI_MODEL || "gpt-5-mini", 100);
const CHRT_ENDPOINT = cleanText(process.env.CHRT_INGEST_URL || "https://chinahumanrightstracker.org/api/ingest/trrb", 2_000);
const CHRT_AUDIENCE = "https://chinahumanrightstracker.org";
const CHRT_SYNC_LOOKBACK_HOURS = intEnv("CHRT_SYNC_LOOKBACK_HOURS", 72, 6, 168);

function intEnv(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}

export function cleanText(value, max = 20_000) {
  return String(value || "").normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

function bearerToken() {
  return cleanText(process.env.X_BEARER_TOKEN || process.env.X_API_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN, 20_000);
}

function requiredEnvironment() {
  const missing = [];
  if (!cleanText(process.env.SUPABASE_URL, 2_000)) missing.push("SUPABASE_URL");
  if (!cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY, 20_000)) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!cleanText(process.env.OPENAI_API_KEY, 20_000)) missing.push("OPENAI_API_KEY");
  if (!RECOVER_ARCHIVED && !REPAIR_TODAY && !bearerToken()) missing.push("X_BEARER_TOKEN");
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function request(url, options = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const payload = await readJson(response);
      throw new Error(`${options.method || "GET"} ${url} → ${response.status}: ${cleanText(payload?.detail || payload?.message || payload?.raw || JSON.stringify(payload), 800)}`);
    }
    return response;
  } finally { clearTimeout(timer); }
}

function supabaseHeaders(prefer = "") {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) };
}

async function supabase(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const base = cleanText(process.env.SUPABASE_URL, 2_000).replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  return readJson(await request(url, { method, headers: supabaseHeaders(prefer), body: body === undefined ? undefined : JSON.stringify(body) }));
}

async function githubOidcToken() {
  const requestUrl = cleanText(process.env.ACTIONS_ID_TOKEN_REQUEST_URL, 4_000);
  const requestToken = cleanText(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, 20_000);
  if (!requestUrl || !requestToken) throw new Error("GitHub OIDC 身份令牌不可用");
  const url = new URL(requestUrl);
  url.searchParams.set("audience", CHRT_AUDIENCE);
  const payload = await readJson(await request(url, {
    headers: { Authorization: `Bearer ${requestToken}`, Accept: "application/json" },
  }));
  const value = cleanText(payload?.value, 20_000);
  if (!value) throw new Error("GitHub OIDC 身份令牌为空");
  return value;
}

function textWithoutLinks(value) { return cleanText(value, 20_000).replace(/https?:\/\/\S+/gi, "").trim(); }

export function deriveTitle(value) {
  const text = textWithoutLinks(value).replace(/^#\S+#[：:\s]*/u, "").replace(/^网友(?:投稿|爆料)[：:\s]*/u, "");
  return cleanText(text.split(/\n|(?<=[。！？!?])\s*/u).find(Boolean) || text, 220) || "中国新闻动态";
}

function isOriginalPost(tweet) {
  return !(Array.isArray(tweet?.referenced_tweets) ? tweet.referenced_tweets : [])
    .some((item) => ["replied_to", "retweeted"].includes(String(item?.type || "")));
}

export function qualifyTweet(tweet) {
  const text = textWithoutLinks(tweet?.text);
  if (!tweet?.id || !text || !isOriginalPost(tweet)) return { accepted: false, reason: "not-original" };
  if (/^RT\s+@/i.test(text)) return { accepted: false, reason: "retweet" };
  const cjkCount = (text.match(/[\u3400-\u9fff]/gu) || []).length;
  if (text.length < 35 || cjkCount < 18) return { accepted: false, reason: "low-information" };
  const title = deriveTitle(text);
  if (!isChinaHotHeadline(title, text)) return { accepted: false, reason: "outside-china-hot" };
  return { accepted: true, reason: "china-news", text, title };
}

export function targetLength(rawText) {
  const length = cleanText(rawText, 20_000).length;
  if (length < 300) return { min: 300, max: 650, band: "short" };
  return { min: Math.min(length, 1200), max: Math.min(1500, Math.max(650, length + 250)), band: "source-led" };
}

function mediaFor(tweet, mediaMap) {
  const keys = Array.isArray(tweet?.attachments?.media_keys) ? tweet.attachments.media_keys : [];
  return keys.map((key) => mediaMap.get(String(key))).filter(Boolean).map((item) => ({
    media_key: cleanText(item.media_key, 100), type: cleanText(item.type, 30),
    url: cleanText(item.url || item.preview_image_url, 2_000), preview_image_url: cleanText(item.preview_image_url, 2_000),
    width: Number(item.width) || null, height: Number(item.height) || null,
  }));
}

async function collectXPosts() {
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", `from:${SOURCE_HANDLE} -is:retweet -is:reply`);
  url.searchParams.set("max_results", "100");
  url.searchParams.set("start_time", new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString());
  url.searchParams.set("tweet.fields", "id,text,created_at,lang,public_metrics,possibly_sensitive,attachments,referenced_tweets");
  url.searchParams.set("expansions", "attachments.media_keys");
  url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height,duration_ms");
  const payload = await readJson(await request(url, { headers: { Authorization: `Bearer ${bearerToken()}`, Accept: "application/json" } }));
  const media = new Map((payload?.includes?.media || []).map((item) => [String(item.media_key), item]));
  const seen = new Set();
  return (payload?.data || []).slice(0, MAX_FETCH).flatMap((tweet) => {
    const id = cleanText(tweet?.id, 100);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ ...tweet, media: mediaFor(tweet, media) }];
  });
}

function externalId(tweetId) { return `x:${SOURCE_HANDLE}:${tweetId}`; }

async function existingCandidate(tweetId) {
  const rows = await supabase("news_candidates", { query: { select: "id,decision,article_id", external_id: `eq.${externalId(tweetId)}`, limit: "1" } });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function existingArticle(tweetId) {
  const rows = await supabase("articles", { query: { select: "id,status", external_id: `eq.${externalId(tweetId)}`, limit: "1" } });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function archivedCandidates() {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();
  const rows = await supabase("news_candidates", { query: {
    select: "id,external_id,raw_text,raw_payload,collected_at",
    pipeline: "like.china-hot-li-teacher-v*", decision: "eq.legacy_archived",
    created_at: `gte.${since}`, order: "created_at.asc", limit: String(MAX_FETCH),
  } });
  return Array.isArray(rows) ? rows : [];
}

function tweetFromCandidate(row) {
  const payload = row?.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {};
  return {
    id: cleanText(row.external_id, 200).split(":").pop(), text: cleanText(row.raw_text, 20_000),
    created_at: payload.source_created_at || row.collected_at, lang: payload.lang || "zh",
    public_metrics: payload.source_public_metrics || payload.public_metrics || {},
    media: payload.source_media || payload.media || [], candidateId: row.id,
  };
}

export function buildCandidate(tweet, qualified, collectedAt = new Date().toISOString()) {
  const tweetId = cleanText(tweet.id, 100);
  const sourceUrl = `https://x.com/${SOURCE_HANDLE}/status/${tweetId}`;
  const target = targetLength(qualified.text);
  return {
    external_id: externalId(tweetId), pipeline: PIPELINE, source_url: sourceUrl,
    source_account: `@${SOURCE_HANDLE}`, source_name: SOURCE_NAME, source_level: "priority_social",
    raw_text: qualified.text,
    raw_payload: { tweet_id: tweetId, source_created_at: tweet.created_at || collectedAt, lang: tweet.lang || "zh", public_metrics: tweet.public_metrics || {}, media: tweet.media || [] },
    ai_payload: { status: "queued", proposed_title: qualified.title, target_min_chars: target.min, target_max_chars: target.max },
    proposed_section: "中国热门头条", confidence: 80, decision: "processing", decision_reason: "中国新闻候选，自动扩写发布中",
    collected_at: collectedAt, created_at: collectedAt, updated_at: collectedAt,
  };
}

async function createCandidate(tweet, qualified) {
  if (DRY_RUN) return { id: null, ...buildCandidate(tweet, qualified) };
  const rows = await supabase("news_candidates", { method: "POST", body: buildCandidate(tweet, qualified), prefer: "return=representation" });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function patchCandidate(id, body) {
  if (DRY_RUN || !id) return;
  await supabase("news_candidates", { method: "PATCH", query: { id: `eq.${id}` }, body: { ...body, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
}

function responseText(response) {
  if (typeof response?.output_text === "string") return response.output_text.trim();
  for (const item of response?.output || []) for (const part of item?.content || []) if (part?.type === "output_text") return String(part.text || "").trim();
  return "";
}

const BOILERPLATE_PATTERNS = [
  /(?:警方|相关部门)提醒/u, /(?:呼吁|提醒)公众/u,
  /公众(?:呼吁|应|需|也需).{0,16}(?:提高警惕|关注|配合|遵守|增强|及时报警)/u,
  /维护社会治安.{0,8}决心/u, /严厉打击类似/u, /共同营造.{0,16}环境/u,
  /该事件(?:再次)?(?:体现|凸显).{0,30}(?:必要性|重要性|力度)/u,
  /请关注后续官方通报/u, /欢迎社会各界共同关注/u,
  /目前能够确认的信息仍以/u, /在权威部门公布更完整材料之前/u,
  /如后续出现正式通报/u, /读者应注意区分/u,
  /知识储备/u, /专业性/u, /说服力/u, /提供了.{0,16}(?:视角|启示)/u,
  /反映出.{0,20}(?:工作状态|生活状态|性格|能力|素质)/u,
  /关键词\s*[:：]/u, /seo[_\s-]*keywords?\s*[:：]/iu,
  /(?:属于|是).{0,16}(?:重要|知名|大型)(?:交通通道|企业|机构|项目)/u,
  /知名大型(?:央企|国企|民企|公司|集团)/u,
  /显著的视觉信息更新/u, /呈现了.{0,20}具体情况/u,
  /昭示.{0,30}(?:过程|燃爆|原因)/u,
  /整体氛围/u, /实则构成/u,
  /环境(?:干净|整洁)/u, /设施(?:完善|完备)/u,
];

export function containsBoilerplate(value) {
  const text = cleanText(value, 20_000);
  return BOILERPLATE_PATTERNS.some((pattern) => pattern.test(text));
}

function visualInputs(tweet) {
  const seen = new Set();
  return (Array.isArray(tweet?.media) ? tweet.media : []).flatMap((item) => {
    const value = cleanText(item?.url || item?.preview_image_url, 2_000);
    if (!/^https:\/\//i.test(value) || seen.has(value)) return [];
    seen.add(value);
    return [{ type: "input_image", image_url: value, detail: "high" }];
  }).slice(0, 4);
}

function visualContext(tweet) {
  const items = Array.isArray(tweet?.media) ? tweet.media : [];
  const photos = items.filter((item) => item?.type === "photo").length;
  const videoPreviews = items.filter((item) => item?.type === "video").length;
  return `随附静态素材说明：照片${photos}张，视频缩略图${videoPreviews}张。视频缩略图不是视频本身，不能据此描述声音、持续时间、动作先后或画面外过程。`;
}

async function generateArticle(qualified, tweet, attempt = 0, previous = null) {
  const target = targetLength(qualified.text);
  const schema = {
    type: "object", additionalProperties: false, required: ["title", "summary", "content", "seo_keywords"],
    properties: {
      title: { type: "string", minLength: 8, maxLength: 100 }, summary: { type: "string", minLength: 50, maxLength: 240 },
      content: { type: "string", minLength: target.min, maxLength: target.max }, seo_keywords: { type: "string", minLength: 5, maxLength: 180 },
    },
  };
  const response = await readJson(await request("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL, store: false, max_output_tokens: target.max > 900 ? 2600 : 1600,
      instructions: [
        "你是唐人日报中国热门头条编辑。只依据输入原文和随附原帖图片整理中文新闻，严禁补造人物、数字、地点、引语、原因或结果。",
        `正文必须为${target.min}至${target.max}个中文字符，采用自然的新闻稿结构。字数必须来自有效信息，禁止用提醒、呼吁、空泛评价或重复句凑字。`,
        "优先从图片中读取可辨认的文字、通知、评论、时间、地点、物件、服装、动作、场景、构图和色彩。图片信息必须用“截图文字显示”“画面可见”等方式明确归因；看不清就不写。",
        "只允许补充确定的基础行政地理关系，例如城市所属省份、区县与城市的关系，以及画面直接显示的场所类型。不要补充企业性质、人物履历、统计数字、历史细节、行业评价或其他模型记忆中的背景。",
        "不得根据长相推断人物性格、职业、身份、族群、健康状况、犯罪倾向或动机；只描述画面中直接可见的表情、姿态、衣着和行为。",
        "不得从书架、服装、表情、建筑、车辆或环境推断知识水平、专业性、经济状况、工作状态、生活状态、性格或可信度。不要使用“显示其”“反映出其”“说明其”等推断句。",
        "随附的视频素材仅为静态缩略图。除非原文明确写出，否则不得写爆炸声、对话、连续动作、持续时间、多次发生或拍摄前后的过程。",
        "场景描述使用可核对的名词、颜色、数量、位置和可见动作，不写“环境整洁”“设施完善”“氛围紧张”等评价性形容。",
        "标题必须保留原文中的中国地点、机构或政治人物等主体，使文章明确属于中国新闻。",
        "对未核实说法准确注明来自发帖者、截图、目击者或公开通报；不要反复写“尚待核实”。",
        "正文和标题不得出现媒体名称、社交平台名称、账号名称、抓取方式或原始链接，不写‘李老师’或‘X平台’。",
        "禁止写任何提醒、呼吁、警惕、号召、建议、启示、意义、必要性、重要性、重视、决心、严厉打击等套话。不要评论，不要像广告或宣传稿。",
        "content字段只能是正文，不得在正文末尾添加关键词、标签、SEO词、来源栏或说明栏；seo_keywords只能放在单独的seo_keywords字段。",
        "不要在正文重复真实性提示，页面会另行统一展示。不要使用Markdown标题。信息确实不足以达到字数时不要编造。",
      ].join("\n"),
      input: [{ role: "user", content: [
        { type: "input_text", text: previous
          ? `原始事实：\n${qualified.text.slice(0, 12_000)}\n\n${visualContext(tweet)}\n\n上一版未通过质量检查（长度${previous.content.length}，或含套话）。请重新阅读原文和图片，完整重写；只能补充有依据的具体信息：\n${previous.content}`
          : `原始事实：\n${qualified.text.slice(0, 12_000)}\n\n${visualContext(tweet)}\n\n请结合随附原帖图片中的可见信息整理文章。` },
        ...visualInputs(tweet),
      ] }],
      text: { format: { type: "json_schema", name: "china_hot_article", strict: true, schema } },
    }),
  }, 60_000));
  const article = JSON.parse(responseText(response));
  article.title = cleanText(article.title, 220); article.summary = cleanText(article.summary, 600); article.content = cleanText(article.content, 10_000);
  if ((article.content.length < target.min || containsBoilerplate(article.content)) && attempt < 5) return generateArticle(qualified, tweet, attempt + 1, article);
  if (article.content.length < target.min || article.content.length > target.max) throw new Error(`生成正文长度${article.content.length}，未达到${target.min}-${target.max}字`);
  if (containsBoilerplate(article.content)) throw new Error("生成正文含提醒、呼吁或宣传式套话，禁止自动发布");
  if (!isChinaHotHeadline(article.title, article.content)) throw new Error("生成稿未明确中国新闻主体");
  return { ...article, seo_keywords: cleanText(article.seo_keywords, 300), target };
}

export function buildPublishedArticle(tweet, qualified, article, publishedAt = new Date().toISOString()) {
  const tweetId = cleanText(tweet.id, 100);
  const sourceUrl = `https://x.com/${SOURCE_HANDLE}/status/${tweetId}`;
  const sourceCreatedAt = new Date(tweet.created_at || publishedAt).toISOString();
  const attachments = Array.isArray(tweet.media) ? tweet.media : [];
  const coverImage = attachments.find((item) => item.type === "photo" && item.url)?.url || "";
  return {
    title: article.title, slug: `li-teacher-x-${tweetId}`, summary: article.summary, content: article.content,
    category_name: CHINA_HOT_CATEGORY, cover_image: coverImage, image_alt: coverImage ? article.title : "", author: "唐人日报编辑部",
    status: "published", visibility: "public", published_at: publishedAt, created_at: publishedAt,
    source_url: sourceUrl, source_name: SOURCE_NAME, source_account: `@${SOURCE_HANDLE}`, source_level: "priority_social",
    source_platform: "x", source_post_id: tweetId, source_created_at: sourceCreatedAt, external_id: externalId(tweetId),
    topic_key: "china", primary_section: "中国热门头条", related_sections: ["中国热门头条"],
    review_status: "automatic_china_hot", automation_source: PIPELINE, ai_confidence: 80, seo_title: article.title,
    seo_description: article.summary, seo_keywords: article.seo_keywords, independent_source_count: 1,
    supporting_sources: [], risk_flags: ["unverified_public_claim"],
    metadata: {
      collector: PIPELINE, automatic_publish: true, manual_review_required: false, review_status: "auto_published",
      category_display_name: "中国热门头条", unverified_public_claim: true, content_warning: WARNING,
      public_source_attribution: false, source_text_original: qualified.text, source_media: attachments,
      source_public_metrics: tweet.public_metrics || {}, openai_model: OPENAI_MODEL, generated_target: article.target,
      editorial_expansion_version: EXPANSION_VERSION, image_grounding_used: visualInputs(tweet).length > 0,
    },
  };
}

export function buildReviewDraft(tweet, reason, createdAt = new Date().toISOString()) {
  const tweetId = cleanText(tweet.id, 100);
  const sourceUrl = `https://x.com/${SOURCE_HANDLE}/status/${tweetId}`;
  const rawText = textWithoutLinks(tweet.text);
  const attachments = Array.isArray(tweet.media) ? tweet.media : [];
  const coverImage = attachments.find((item) => item.type === "photo" && item.url)?.url
    || attachments.find((item) => item.preview_image_url)?.preview_image_url || "";
  return {
    title: deriveTitle(rawText), slug: `li-teacher-x-${tweetId}`, summary: cleanText(rawText, 300),
    content: rawText, category_name: CHINA_HOT_CATEGORY, cover_image: coverImage,
    image_alt: coverImage ? deriveTitle(rawText) : "", author: "唐人日报编辑部",
    status: "draft", visibility: "private", published_at: null, created_at: createdAt,
    source_url: sourceUrl, source_name: SOURCE_NAME, source_account: `@${SOURCE_HANDLE}`,
    source_level: "priority_social", source_platform: "x", source_post_id: tweetId,
    source_created_at: new Date(tweet.created_at || createdAt).toISOString(), external_id: externalId(tweetId),
    topic_key: "china", primary_section: "中国热门头条", related_sections: ["中国热门头条"],
    review_status: "manual_review", automation_source: PIPELINE, independent_source_count: 1,
    supporting_sources: [], risk_flags: ["manual_review_required"],
    metadata: {
      collector: PIPELINE, automatic_publish: false, manual_review_required: true,
      review_status: "manual_review", review_reason: cleanText(reason, 800), editable: true,
      manual_publish_allowed: true, category_display_name: "中国热门头条",
      source_text_original: rawText, source_media: attachments,
    },
  };
}

async function publishArticle(body) {
  if (DRY_RUN) return { id: null };
  const rows = await supabase("articles", { method: "POST", body, prefer: "return=representation" });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function keepEditableDraft(tweet, reason) {
  const prior = await existingArticle(tweet.id);
  if (prior) return prior;
  return publishArticle(buildReviewDraft(tweet, reason));
}

async function requireManualReview(candidate, tweet, reason) {
  const draft = await keepEditableDraft(tweet, reason);
  await patchCandidate(candidate?.id || tweet.candidateId, {
    decision: "review_required", decision_reason: reason, article_id: draft?.id || null,
    processed_at: new Date().toISOString(),
    ai_payload: { status: "review_required", editable: true, manual_publish_allowed: true, reason },
  });
  return draft;
}

async function recoverArchivedBatch() {
  const rows = await archivedCandidates();
  const queue = rows.map((row) => ({ row, tweet: tweetFromCandidate(row) }));
  const results = [];
  const counters = { fetched: queue.length, qualified: 0, published: 0, duplicate: 0, review_required: 0, failed: 0 };
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const current = cursor++;
      const { row, tweet } = queue[current];
      try {
        const prior = await existingArticle(tweet.id);
        if (prior) {
          counters.duplicate += 1;
          await patchCandidate(row.id, { decision: prior.status === "published" ? "published" : "review_required", decision_reason: "文章库已存在同源记录", article_id: prior.id, processed_at: new Date().toISOString() });
          results.push({ tweetId: tweet.id, status: "existing", articleId: prior.id });
          continue;
        }
        const qualified = qualifyTweet(tweet);
        if (!qualified.accepted) {
          const reason = `自动发布复核未通过：${qualified.reason}；保留为可编辑草稿，由编辑决定是否发布`;
          const draft = await requireManualReview(row, tweet, reason);
          counters.review_required += 1;
          results.push({ tweetId: tweet.id, status: "review-required", articleId: draft?.id || null, reason: qualified.reason });
          continue;
        }
        counters.qualified += 1;
        if (counters.published >= MAX_PUBLISH) {
          results.push({ tweetId: tweet.id, status: "deferred" });
          continue;
        }
        const generated = await generateArticle(qualified, tweet);
        const saved = await publishArticle(buildPublishedArticle(tweet, qualified, generated));
        await patchCandidate(row.id, { decision: "published", decision_reason: "中国新闻自动扩写并发布", article_id: saved?.id || null, processed_at: new Date().toISOString(), ai_payload: { status: "published", title: generated.title, summary: generated.summary, content: generated.content, seo_keywords: generated.seo_keywords, target: generated.target } });
        counters.published += 1;
        results.push({ tweetId: tweet.id, status: DRY_RUN ? "dry-run" : "published", articleId: saved?.id || null, title: generated.title });
      } catch (error) {
        const reason = `自动扩写或发布失败：${cleanText(error?.message || error, 600)}；保留为可编辑草稿，由编辑决定是否发布`;
        try {
          const draft = await requireManualReview(row, tweet, reason);
          counters.review_required += 1;
          results.push({ tweetId: tweet.id, status: "review-required", articleId: draft?.id || null, error: cleanText(error?.message || error, 800) });
        } catch (draftError) {
          counters.failed += 1;
          results.push({ tweetId: tweet.id, status: "failed", error: cleanText(draftError?.message || draftError, 800) });
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PUBLISH_CONCURRENCY, queue.length || 1) }, () => worker()));
  const report = { pipeline: PIPELINE, mode: "recover-archived", checkedAt: new Date().toISOString(), lookbackHours: LOOKBACK_HOURS, ...counters, results };
  console.log(JSON.stringify(report, null, 2));
  if (counters.failed) throw new Error(`仍有${counters.failed}条记录未能保留到后台`);
  return report;
}

async function repairablePublishedArticles() {
  const rows = await supabase("articles", { query: {
    select: "id,title,summary,content,seo_keywords,source_post_id,source_created_at,created_at,metadata",
    automation_source: `eq.${PIPELINE}`, category_name: `eq.${CHINA_HOT_CATEGORY}`,
    status: "eq.published", visibility: "eq.public", created_at: `gte.${REPAIR_SINCE}`,
    order: "created_at.asc", limit: "200",
  } });
  return (Array.isArray(rows) ? rows : []).filter((row) => (
    row?.metadata?.automatic_publish === true
    && row?.metadata?.editorial_expansion_version !== EXPANSION_VERSION
  ));
}

function tweetFromArticle(row) {
  return {
    id: cleanText(row.source_post_id, 100),
    text: cleanText(row?.metadata?.source_text_original || row.content, 20_000),
    created_at: row.source_created_at || row.created_at,
    public_metrics: row?.metadata?.source_public_metrics || {},
    media: Array.isArray(row?.metadata?.source_media) ? row.metadata.source_media : [],
  };
}

export function buildChrtRecord(row) {
  return {
    sourcePlatform: cleanText(row?.source_platform, 30),
    sourcePostId: cleanText(row?.source_post_id, 100),
    sourceCreatedAt: row?.source_created_at || row?.created_at || null,
    sourceUrl: cleanText(row?.source_url, 2_000),
    sourceHandle: cleanText(row?.source_account, 200),
    section: cleanText(row?.primary_section || row?.category_name, 100),
    title: cleanText(row?.title, 240),
    summary: cleanText(row?.summary, 1_000),
    content: cleanText(row?.content, 20_000),
    originalText: cleanText(row?.metadata?.source_text_original, 20_000),
  };
}

async function recentPublishedArticlesForChrt() {
  const since = new Date(Date.now() - CHRT_SYNC_LOOKBACK_HOURS * 3_600_000).toISOString();
  const rows = await supabase("articles", { query: {
    select: "id,title,summary,content,category_name,source_url,source_account,source_platform,source_post_id,source_created_at,created_at,primary_section,metadata",
    automation_source: `eq.${PIPELINE}`, source_platform: "eq.x",
    status: "eq.published", visibility: "eq.public", created_at: `gte.${since}`,
    order: "created_at.asc", limit: "500",
  } });
  return Array.isArray(rows) ? rows : [];
}

async function syncPublishedArticlesToChrt() {
  if (DRY_RUN) return { received: 0, inserted: 0, duplicates: 0, rejected: 0, removed: 0, dryRun: true };
  const rows = await recentPublishedArticlesForChrt();
  if (!rows.length) return { received: 0, inserted: 0, duplicates: 0, rejected: 0, removed: 0 };
  const token = await githubOidcToken();
  const records = rows.slice(0, 500).map(buildChrtRecord);
  const payload = await readJson(await request(CHRT_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ records, replaceWindowHours: CHRT_SYNC_LOOKBACK_HOURS, syncMode: "reconcile" }),
  }, 45_000));
  const totals = {
    received: Number(payload?.received) || 0,
    inserted: Number(payload?.inserted) || 0,
    duplicates: Number(payload?.duplicates) || 0,
    rejected: Number(payload?.rejected) || 0,
    removed: Number(payload?.removed) || 0,
  };
  console.log(JSON.stringify({ chrt: totals }, null, 2));
  return totals;
}

async function repairTodayBatch() {
  const rows = await repairablePublishedArticles();
  const results = [];
  const counters = { fetched: rows.length, repaired: 0, skipped: 0, failed: 0 };
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      try {
        const tweet = tweetFromArticle(row);
        const rawText = textWithoutLinks(tweet.text);
        const qualified = { accepted: true, reason: "repair", text: rawText, title: deriveTitle(rawText) };
        if (!tweet.id || rawText.length < 35) {
          counters.skipped += 1;
          results.push({ id: row.id, status: "skipped", reason: "missing-source-material" });
          continue;
        }
        const article = await generateArticle(qualified, tweet);
        const metadata = {
          ...(row.metadata || {}), editorial_expansion_version: EXPANSION_VERSION,
          image_grounding_used: visualInputs(tweet).length > 0,
          repaired_at: new Date().toISOString(), openai_model: OPENAI_MODEL,
          generated_target: article.target,
        };
        if (!DRY_RUN) await supabase("articles", {
          method: "PATCH", query: { id: `eq.${row.id}` }, prefer: "return=minimal",
          body: {
            title: article.title, summary: article.summary, content: article.content,
            seo_title: article.title, seo_description: article.summary,
            seo_keywords: article.seo_keywords, metadata, updated_at: new Date().toISOString(),
          },
        });
        counters.repaired += 1;
        results.push({ id: row.id, status: DRY_RUN ? "dry-run" : "repaired", title: article.title, chars: article.content.length });
      } catch (error) {
        counters.failed += 1;
        results.push({ id: row.id, status: "failed", error: cleanText(error?.message || error, 800) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PUBLISH_CONCURRENCY, rows.length || 1) }, () => worker()));
  const report = { pipeline: PIPELINE, mode: "repair-today", expansionVersion: EXPANSION_VERSION, since: REPAIR_SINCE, checkedAt: new Date().toISOString(), ...counters, results };
  console.log(JSON.stringify(report, null, 2));
  if (counters.failed) throw new Error(`有${counters.failed}篇今日自动稿未完成重写，可再次运行修复任务`);
  return report;
}

export async function run() {
  requiredEnvironment();
  if (REPAIR_TODAY) {
    const report = await repairTodayBatch();
    report.chrt = await syncPublishedArticlesToChrt();
    return report;
  }
  if (RECOVER_ARCHIVED) {
    const report = await recoverArchivedBatch();
    report.chrt = await syncPublishedArticlesToChrt();
    return report;
  }
  const tweets = await collectXPosts();
  const results = [];
  const counters = { fetched: tweets.length, qualified: 0, published: 0, duplicate: 0, filtered: 0, failed: 0 };
  for (const tweet of tweets.sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))) {
    const qualified = qualifyTweet(tweet);
    if (!qualified.accepted) {
      counters.filtered += 1;
      const reviewInput = { accepted: true, text: textWithoutLinks(tweet.text), title: deriveTitle(tweet.text) };
      const candidate = await existingCandidate(tweet.id) || await createCandidate(tweet, reviewInput);
      const reason = `自动发布复核未通过：${qualified.reason}；保留为可编辑草稿，由编辑决定是否发布`;
      const draft = await requireManualReview(candidate, tweet, reason);
      results.push({ tweetId: tweet.id, status: "review-required", reason: qualified.reason, articleId: draft?.id || null });
      continue;
    }
    counters.qualified += 1;
    const priorCandidate = await existingCandidate(tweet.id);
    if (priorCandidate && priorCandidate.decision !== "failed") { counters.duplicate += 1; results.push({ tweetId: tweet.id, status: "duplicate-pool", decision: priorCandidate.decision }); continue; }
    const priorArticle = await existingArticle(tweet.id);
    if (priorArticle) { counters.duplicate += 1; results.push({ tweetId: tweet.id, status: "duplicate-article", articleId: priorArticle.id }); continue; }
    if (counters.published >= MAX_PUBLISH) { results.push({ tweetId: tweet.id, status: "deferred" }); continue; }
    const candidate = priorCandidate || await createCandidate(tweet, qualified);
    try {
      const generated = await generateArticle(qualified, tweet);
      const articleBody = buildPublishedArticle(tweet, qualified, generated);
      const saved = await publishArticle(articleBody);
      await patchCandidate(candidate?.id, { decision: "published", decision_reason: "中国新闻自动扩写并发布", article_id: saved?.id || null, processed_at: new Date().toISOString(), ai_payload: { status: "published", title: generated.title, summary: generated.summary, content: generated.content, seo_keywords: generated.seo_keywords, target: generated.target } });
      counters.published += 1; results.push({ tweetId: tweet.id, status: DRY_RUN ? "dry-run" : "published", articleId: saved?.id || null, title: generated.title });
    } catch (error) {
      const reason = `自动扩写或发布失败：${cleanText(error?.message || error, 600)}；保留为可编辑草稿，由编辑决定是否发布`;
      const draft = await requireManualReview(candidate, tweet, reason);
      results.push({ tweetId: tweet.id, status: "review-required", articleId: draft?.id || null, error: cleanText(error?.message || error, 800) });
    }
  }
  const chrt = await syncPublishedArticlesToChrt();
  const report = { pipeline: PIPELINE, mode: DRY_RUN ? "dry-run" : "auto-publish", checkedAt: new Date().toISOString(), lookbackHours: LOOKBACK_HOURS, ...counters, chrt, results };
  console.log(JSON.stringify(report, null, 2));
  if (counters.failed) throw new Error("本轮仍有中国热门头条未能发布或保留为可编辑草稿");
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run().catch((error) => { console.error("中国热门头条采集发布失败：", error); process.exitCode = 1; });
