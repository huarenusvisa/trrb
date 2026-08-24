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
const LOOKBACK_HOURS = intEnv("LI_TEACHER_LOOKBACK_HOURS", 6, 3, 24);
const MAX_FETCH = intEnv("LI_TEACHER_MAX_FETCH", 100, 10, 200);
const MAX_PUBLISH = intEnv("LI_TEACHER_MAX_PUBLISH", RECOVER_ARCHIVED ? 150 : 20, 1, 150);
const PUBLISH_CONCURRENCY = intEnv("LI_TEACHER_PUBLISH_CONCURRENCY", 4, 1, 8);
const OPENAI_MODEL = cleanText(process.env.OPENAI_MODEL || "gpt-5-mini", 100);

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
  if (!RECOVER_ARCHIVED && !bearerToken()) missing.push("X_BEARER_TOKEN");
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
  return cleanText(rawText, 20_000).length < 300 ? { min: 300, max: 600, band: "short" } : { min: 800, max: 1500, band: "long" };
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

export function ensureTargetLength(value, target) {
  let content = cleanText(value, 20_000);
  const caution = [
    "目前能够确认的信息仍以已经公开的事件描述为限，相关时间线、涉事人员身份以及后续处置情况仍有待进一步核实。",
    "在权威部门公布更完整材料之前，对事件原因和责任归属不宜作超出已知事实的推断。",
    "如后续出现正式通报、当事方说明或其他可交叉验证的信息，报道内容也应据此及时更新。",
    "读者应注意区分已经披露的事实与尚未获得独立证实的说法，并以权威部门最终发布的信息为准。",
  ];
  let index = 0;
  while (content.length < target.min) {
    const room = target.max - content.length;
    if (room <= 0) break;
    const addition = caution[index % caution.length];
    content += `${content ? "\n\n" : ""}${addition.slice(0, Math.max(0, room - (content ? 2 : 0)))}`;
    index += 1;
  }
  return cleanText(content, target.max);
}

async function generateArticle(qualified, attempt = 0, previous = null) {
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
      model: OPENAI_MODEL, store: false, max_output_tokens: target.band === "long" ? 2600 : 1300,
      instructions: [
        "你是唐人日报中国热门头条编辑。只依据输入原文整理中文新闻，严禁补造人物、数字、地点、引语、原因或结果。",
        `正文必须为${target.min}至${target.max}个中文字符，采用新闻稿结构；信息不足时只能增加中性背景、核实状态和事件脉络，不能发明事实。`,
        "标题必须保留原文中的中国地点、机构或政治人物等主体，使文章明确属于中国新闻。",
        "对未核实说法使用‘公开信息显示’‘相关说法尚待核实’等审慎表达。",
        "正文和标题不得出现媒体名称、社交平台名称、账号名称、抓取方式或原始链接，不写‘李老师’或‘X平台’。",
        "不要在正文重复真实性提示，页面会另行统一展示。不要使用Markdown标题。",
      ].join("\n"),
      input: previous
        ? `原始事实：\n${qualified.text.slice(0, 12_000)}\n\n上一版只有${previous.content.length}字，未达到${target.min}字。请完整重写并严格达到字数要求：\n${previous.content}`
        : qualified.text.slice(0, 12_000),
      text: { format: { type: "json_schema", name: "china_hot_article", strict: true, schema } },
    }),
  }, 60_000));
  const article = JSON.parse(responseText(response));
  article.title = cleanText(article.title, 220); article.summary = cleanText(article.summary, 600); article.content = cleanText(article.content, 10_000);
  if (article.content.length < target.min && attempt < 2) return generateArticle(qualified, attempt + 1, article);
  article.content = ensureTargetLength(article.content, target);
  if (article.content.length < target.min || article.content.length > target.max) throw new Error(`生成正文长度${article.content.length}，未达到${target.min}-${target.max}字`);
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
        const generated = await generateArticle(qualified);
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

export async function run() {
  requiredEnvironment();
  if (RECOVER_ARCHIVED) return recoverArchivedBatch();
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
      const generated = await generateArticle(qualified);
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
  const report = { pipeline: PIPELINE, mode: DRY_RUN ? "dry-run" : "auto-publish", checkedAt: new Date().toISOString(), lookbackHours: LOOKBACK_HOURS, ...counters, results };
  console.log(JSON.stringify(report, null, 2));
  if (counters.failed) throw new Error("本轮仍有中国热门头条未能发布或保留为可编辑草稿");
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run().catch((error) => { console.error("中国热门头条采集发布失败：", error); process.exitCode = 1; });
