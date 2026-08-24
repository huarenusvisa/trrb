#!/usr/bin/env node
import process from "node:process";
import { pathToFileURL } from "node:url";
import chinaHotHeadlines from "../netlify/functions/_shared/china-hot-headlines.js";

const { CHINA_HOT_CATEGORY, isChinaHotHeadline } = chinaHotHeadlines;
const SOURCE_HANDLE = "whyyoutouzhele";
const SOURCE_NAME = "李老师不是你老师";
const PIPELINE = "china-hot-li-teacher-v1";
const DRY_RUN = process.argv.includes("--dry-run");
const LOOKBACK_HOURS = intEnv("LI_TEACHER_LOOKBACK_HOURS", 72, 1, 168);
const MAX_FETCH = intEnv("LI_TEACHER_MAX_FETCH", 200, 10, 300);
const MAX_INSERT = intEnv("LI_TEACHER_MAX_INSERT", 40, 1, 100);

function intEnv(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}

export function cleanText(value, max = 20_000) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function bearerToken() {
  return cleanText(
    process.env.X_BEARER_TOKEN || process.env.X_API_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN,
    20_000,
  );
}

function requiredEnvironment() {
  const missing = [];
  if (!cleanText(process.env.SUPABASE_URL, 2_000)) missing.push("SUPABASE_URL");
  if (!cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY, 20_000)) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!bearerToken()) missing.push("X_BEARER_TOKEN");
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return { raw: text }; }
}

async function request(url, options = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const payload = await readJson(response);
      const message = cleanText(payload?.detail || payload?.title || payload?.raw || JSON.stringify(payload), 800);
      throw new Error(`${options.method || "GET"} ${url} → ${response.status}: ${message}`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function supabaseHeaders(prefer = "") {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function supabase(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
  const base = cleanText(process.env.SUPABASE_URL, 2_000).replace(/\/+$/, "");
  const url = new URL(`${base}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await request(url, {
    method,
    headers: supabaseHeaders(prefer),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readJson(response);
}

function textWithoutLinks(value) {
  return cleanText(value, 20_000).replace(/https?:\/\/\S+/gi, "").trim();
}

export function deriveTitle(value) {
  const text = textWithoutLinks(value)
    .replace(/^#\S+#[：:\s]*/u, "")
    .replace(/^网友(?:投稿|爆料)[：:\s]*/u, "");
  const first = text.split(/\n|(?<=[。！？!?])\s*/u).find(Boolean) || text;
  return cleanText(first, 220) || "李老师来源待审核内容";
}

function isOriginalPost(tweet) {
  const refs = Array.isArray(tweet?.referenced_tweets) ? tweet.referenced_tweets : [];
  return !refs.some((item) => ["replied_to", "retweeted"].includes(String(item?.type || "")));
}

export function qualifyTweet(tweet) {
  const text = textWithoutLinks(tweet?.text);
  if (!tweet?.id || !text || !isOriginalPost(tweet)) return { accepted: false, reason: "not-original" };
  if (/^RT\s+@/i.test(text)) return { accepted: false, reason: "retweet" };
  const cjkCount = (text.match(/[\u3400-\u9fff]/gu) || []).length;
  if (text.length < 35 || cjkCount < 18) return { accepted: false, reason: "low-information" };
  const title = deriveTitle(text);
  if (!isChinaHotHeadline(title, text)) return { accepted: false, reason: "outside-china-hot" };
  return { accepted: true, reason: "china-hot", text, title };
}

function mediaFor(tweet, mediaMap) {
  const keys = Array.isArray(tweet?.attachments?.media_keys) ? tweet.attachments.media_keys : [];
  return keys.map((key) => mediaMap.get(String(key))).filter(Boolean).map((item) => ({
    media_key: cleanText(item.media_key, 100),
    type: cleanText(item.type, 30),
    url: cleanText(item.url || item.preview_image_url, 2_000),
    preview_image_url: cleanText(item.preview_image_url, 2_000),
    width: Number(item.width) || null,
    height: Number(item.height) || null,
  }));
}

async function collectXPosts() {
  const startTime = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();
  const all = [];
  const media = new Map();
  let nextToken = "";
  do {
    const url = new URL("https://api.x.com/2/tweets/search/recent");
    url.searchParams.set("query", `from:${SOURCE_HANDLE} -is:retweet -is:reply`);
    url.searchParams.set("max_results", "100");
    url.searchParams.set("start_time", startTime);
    url.searchParams.set("tweet.fields", "id,text,created_at,lang,public_metrics,possibly_sensitive,attachments,referenced_tweets");
    url.searchParams.set("expansions", "attachments.media_keys");
    url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height,duration_ms");
    if (nextToken) url.searchParams.set("next_token", nextToken);
    const response = await request(url, {
      headers: { Authorization: `Bearer ${bearerToken()}`, Accept: "application/json" },
    });
    const payload = await readJson(response);
    for (const item of payload?.includes?.media || []) media.set(String(item.media_key), item);
    all.push(...(payload?.data || []));
    nextToken = cleanText(payload?.meta?.next_token, 300);
  } while (nextToken && all.length < MAX_FETCH);

  const seen = new Set();
  return all.slice(0, MAX_FETCH).flatMap((tweet) => {
    const id = cleanText(tweet?.id, 100);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ ...tweet, media: mediaFor(tweet, media) }];
  });
}

function externalId(tweetId) {
  return `x:${SOURCE_HANDLE}:${tweetId}`;
}

async function findExisting(tweetId) {
  const rows = await supabase("articles", {
    query: { select: "id,title,status", external_id: `eq.${externalId(tweetId)}`, limit: "1" },
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

export function buildDraft(tweet, qualified, collectedAt = new Date().toISOString()) {
  const tweetId = cleanText(tweet.id, 100);
  const sourceUrl = `https://x.com/${SOURCE_HANDLE}/status/${tweetId}`;
  const sourceCreatedAt = new Date(tweet.created_at || collectedAt).toISOString();
  const attachments = Array.isArray(tweet.media) ? tweet.media : [];
  const coverImage = attachments.find((item) => item.type === "photo" && item.url)?.url || "";
  const sourceLine = `\n\n来源：${SOURCE_NAME}（@${SOURCE_HANDLE}）\n原始链接：${sourceUrl}`;
  return {
    title: qualified.title,
    slug: `li-teacher-x-${tweetId}`,
    summary: cleanText(qualified.text, 300),
    content: `${qualified.text}${sourceLine}`,
    category_name: CHINA_HOT_CATEGORY,
    cover_image: coverImage,
    author: "唐人日报内容中心",
    status: "draft",
    visibility: "private",
    published_at: null,
    created_at: collectedAt,
    source_url: sourceUrl,
    source_name: SOURCE_NAME,
    source_account: `@${SOURCE_HANDLE}`,
    source_level: "priority_social",
    source_platform: "x",
    source_post_id: tweetId,
    source_created_at: sourceCreatedAt,
    external_id: externalId(tweetId),
    topic_key: "china",
    primary_section: "中国热门头条",
    related_sections: ["中国热门头条"],
    review_status: "pending_review",
    automation_source: PIPELINE,
    independent_source_count: 1,
    supporting_sources: [{ name: SOURCE_NAME, account: `@${SOURCE_HANDLE}`, url: sourceUrl, level: "priority_social" }],
    metadata: {
      collector: PIPELINE,
      content_center: true,
      manual_review_required: true,
      automatic_publish: false,
      review_status: "pending_review",
      category_display_name: "中国热门头条",
      source_priority: "priority",
      source_text_original: qualified.text,
      source_language: cleanText(tweet.lang || "zh", 20),
      source_public_metrics: tweet.public_metrics || {},
      source_media: attachments,
      collected_at: collectedAt,
    },
  };
}

async function insertDraft(body) {
  if (DRY_RUN) return { id: null, dryRun: true };
  const rows = await supabase("articles", { method: "POST", body, prefer: "return=representation" });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function run() {
  requiredEnvironment();
  const tweets = await collectXPosts();
  const results = [];
  const counters = { fetched: tweets.length, accepted: 0, inserted: 0, duplicate: 0, filtered: 0 };
  for (const tweet of tweets.sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))) {
    const qualified = qualifyTweet(tweet);
    if (!qualified.accepted) {
      counters.filtered += 1;
      results.push({ tweetId: tweet.id, status: "filtered", reason: qualified.reason });
      continue;
    }
    counters.accepted += 1;
    const existing = await findExisting(tweet.id);
    if (existing) {
      counters.duplicate += 1;
      results.push({ tweetId: tweet.id, status: "duplicate", articleId: existing.id, title: existing.title });
      continue;
    }
    if (counters.inserted >= MAX_INSERT) {
      results.push({ tweetId: tweet.id, status: "deferred", reason: "per-run-limit" });
      continue;
    }
    const body = buildDraft(tweet, qualified);
    try {
      const saved = await insertDraft(body);
      counters.inserted += 1;
      results.push({ tweetId: tweet.id, status: DRY_RUN ? "dry-run" : "drafted", articleId: saved?.id || null, title: body.title });
    } catch (error) {
      if (/duplicate key|unique constraint|409/i.test(String(error?.message || error))) {
        counters.duplicate += 1;
        results.push({ tweetId: tweet.id, status: "duplicate-race" });
      } else {
        results.push({ tweetId: tweet.id, status: "failed", error: cleanText(error?.message || error, 800) });
      }
    }
  }
  const report = {
    pipeline: PIPELINE,
    source: `${SOURCE_NAME} (@${SOURCE_HANDLE})`,
    mode: DRY_RUN ? "dry-run" : "content-center-drafts",
    checkedAt: new Date().toISOString(),
    lookbackHours: LOOKBACK_HOURS,
    ...counters,
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  if (results.some((item) => item.status === "failed")) throw new Error("部分李老师内容写入失败，请检查上方结果");
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error("李老师内容采集失败：", error);
    process.exitCode = 1;
  });
}
