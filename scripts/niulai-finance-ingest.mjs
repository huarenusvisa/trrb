#!/usr/bin/env node
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  OFFICIAL_FEEDS,
  buildXQuery,
  cleanText,
  dedupeItems,
  extractOfficialPageText,
  isRecent,
  itemIdentity,
  parseHandleList,
  parseOfficialFeed,
} from "./lib/niulai-finance-sources.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const LOOKBACK_HOURS = intEnv("NIULAI_FINANCE_LOOKBACK_HOURS", 72, 6, 168);
const MAX_PUBLISH = intEnv("NIULAI_FINANCE_MAX_PUBLISH", 6, 1, 20);
const OPENAI_MODEL = cleanText(process.env.OPENAI_MODEL || "gpt-5-mini", 100);
const SOURCE_USER_AGENT = "Tang Daily LLC / Niulai financial-news monitor (https://niulai.us)";

function intEnv(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}

function requiredEnvironment() {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"];
  const missing = required.filter((name) => !cleanText(process.env[name], 10_000));
  if (missing.length) throw new Error(`缺少GitHub Secret：${missing.join(", ")}`);
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return { raw: text }; }
}

async function request(url, options = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${options.method || "GET"} ${url} → ${response.status}: ${cleanText(text, 500)}`);
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

async function collectFeed(source) {
  const response = await request(source.url, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml;q=0.9", "User-Agent": SOURCE_USER_AGENT },
  });
  const xml = (await response.text()).slice(0, 2_000_000);
  const items = parseOfficialFeed(xml, source).filter((item) => isRecent(item, Date.now(), LOOKBACK_HOURS));
  return { source: source.key, items };
}

async function collectOfficialFeeds() {
  const settled = await Promise.allSettled(OFFICIAL_FEEDS.map(collectFeed));
  const items = [];
  const sources = [];
  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const source = OFFICIAL_FEEDS[index];
    if (result.status === "fulfilled") {
      sources.push({ key: source.key, ok: true, count: result.value.items.length });
      items.push(...result.value.items);
    } else {
      sources.push({ key: source.key, ok: false, count: 0, error: cleanText(result.reason?.message || result.reason, 300) });
    }
  }
  return { items, sources };
}

async function collectOfficialX() {
  const bearer = cleanText(process.env.X_BEARER_TOKEN || process.env.X_API_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN, 10_000);
  if (!bearer) return { configured: false, items: [], error: null };
  const handles = parseHandleList(process.env.NIULAI_X_HANDLES);
  const query = buildXQuery(handles);
  if (!query) return { configured: true, items: [], error: "没有配置X官方账号" };
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", "100");
  url.searchParams.set("start_time", new Date(Date.now() - Math.min(LOOKBACK_HOURS, 168) * 3_600_000).toISOString());
  url.searchParams.set("tweet.fields", "created_at,lang,author_id");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username,name,verified");
  try {
    const response = await request(url, { headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" } });
    const payload = await readJson(response);
    const users = new Map((payload?.includes?.users || []).map((user) => [String(user.id), user]));
    const allowed = new Set(handles.map((handle) => handle.toLowerCase()));
    const items = (payload?.data || []).flatMap((post) => {
      const author = users.get(String(post.author_id)) || {};
      const username = cleanText(author.username, 100);
      const text = cleanText(post.text, 8_000);
      if (!username || !allowed.has(username.toLowerCase()) || !text || !post.created_at) return [];
      return [{
        platform: "x",
        sourceKey: `x-${username.toLowerCase()}`,
        sourceName: cleanText(author.name, 200) || username,
        sourceAccount: `@${username}`,
        tag: /federalreserve|ustreasury|bls_gov|bea_news/i.test(username) ? "MACRO" : "REGULATION",
        title: text.split(/\n|[.!?。！？]/)[0].slice(0, 240) || text.slice(0, 240),
        description: text,
        language: cleanText(post.lang, 20),
        url: `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(post.id)}`,
        publishedAt: new Date(post.created_at).toISOString(),
        rawId: String(post.id),
      }];
    }).filter((item) => isRecent(item, Date.now(), LOOKBACK_HOURS));
    return { configured: true, items, error: null, handles };
  } catch (error) {
    return { configured: true, items: [], error: cleanText(error?.message || error, 500), handles };
  }
}

async function enrichOfficialItem(item) {
  if (item.platform !== "official_feed" || cleanText(item.description, 12_000).length >= 500) return item;
  try {
    const response = await request(item.url, {
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": SOURCE_USER_AGENT },
    }, 15_000);
    const html = (await response.text()).slice(0, 3_000_000);
    const pageText = extractOfficialPageText(html, 12_000);
    return pageText.length > item.description.length ? { ...item, description: pageText } : item;
  } catch (error) {
    console.warn(`官方正文读取失败，继续使用订阅摘要：${item.sourceKey} ${cleanText(error?.message || error, 240)}`);
    return item;
  }
}

function responseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  for (const item of response?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") return part.text.trim();
    }
  }
  return "";
}

const ARTICLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "content", "seo_keywords", "importance"],
  properties: {
    title: { type: "string", minLength: 10, maxLength: 90 },
    summary: { type: "string", minLength: 40, maxLength: 240 },
    content: { type: "string", minLength: 180, maxLength: 1800 },
    seo_keywords: { type: "string", minLength: 8, maxLength: 180 },
    importance: { type: "string", enum: ["high", "normal", "low"] },
  },
};

async function createChineseArticle(item) {
  const input = [
    `官方机构：${item.sourceName}`,
    `原始标题：${item.title}`,
    `发布时间：${item.publishedAt}`,
    `原始摘要或帖子：${item.description || item.title}`,
    `官方链接：${item.url}`,
  ].join("\n\n").slice(0, 12_000);
  const response = await request("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      store: false,
      max_output_tokens: 1_800,
      instructions: [
        "你是牛来｜唐人财经的财经快讯编辑。只依据输入中的官方原文撰写简体中文快讯。",
        "不得补充原文没有的数字、人物表态、市场涨跌、因果关系或投资建议。",
        "保留关键数字、日期、机构名称和政策措辞；不确定的信息明确写成尚待后续披露。",
        "标题客观、清楚、避免夸张。正文约300至900个中文字符，分2至5段。",
        "不要复制长段原文，不要使用Markdown标题，不要写‘据AI分析’。",
      ].join("\n"),
      input,
      text: { format: { type: "json_schema", name: "niulai_finance_official_article", strict: true, schema: ARTICLE_SCHEMA } },
    }),
  }, 30_000);
  const payload = await readJson(response);
  const output = JSON.parse(responseText(payload));
  const title = cleanText(output.title, 220);
  const summary = cleanText(output.summary, 600);
  const content = cleanText(output.content, 5_000);
  if (title.length < 10 || summary.length < 40 || content.length < 180) throw new Error("AI返回的中文稿件未达到最小内容要求");
  return { title, summary, content, seoKeywords: cleanText(output.seo_keywords, 300), importance: output.importance };
}

async function findExisting(externalId) {
  const rows = await supabase("articles", { query: { select: "id,title,status", external_id: `eq.${externalId}`, limit: "1" } });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function publishItem(item, article) {
  const identity = itemIdentity(item);
  const publishedAt = new Date(item.publishedAt).toISOString();
  const time = new Date().toISOString();
  const sourceLine = `\n\n官方来源：${item.sourceName}\n原始链接：${item.url}`;
  const body = {
    title: article.title,
    slug: identity.slug,
    summary: article.summary,
    content: `${article.content}${sourceLine}`,
    category_name: "牛来财经",
    cover_image: "",
    author: "牛来｜唐人财经",
    status: "draft",
    visibility: "private",
    published_at: null,
    created_at: time,
    source_url: item.url,
    source_name: item.sourceName,
    source_account: item.sourceAccount,
    source_level: "official",
    source_platform: item.platform,
    source_post_id: identity.sourcePostId,
    source_created_at: publishedAt,
    external_id: identity.externalId,
    topic_key: "finance",
    primary_section: "牛来财经",
    related_sections: ["牛来财经"],
    review_status: "pending_review",
    automation_source: "niulai-finance-official-v1",
    ai_confidence: 95,
    seo_title: article.title,
    seo_description: article.summary,
    seo_keywords: article.seoKeywords,
    independent_source_count: 1,
    supporting_sources: [{ name: item.sourceName, url: item.url, level: "official" }],
    metadata: {
      publisher_version: "niulai-finance-v1",
      requested_status: "draft",
      official_source: true,
      automatic_publish: false,
      source_key: item.sourceKey,
      source_title_original: item.title,
      source_excerpt_original: cleanText(item.description, 8_000),
      source_language: cleanText(item.language || "en", 20),
      source_tag: item.tag,
      importance: article.importance,
      openai_model: OPENAI_MODEL,
      disclaimer: "仅供新闻资讯，不构成投资建议",
    },
  };
  if (DRY_RUN) return { dryRun: true, identity, title: article.title };
  try {
    const rows = await supabase("articles", { method: "POST", body, prefer: "return=representation" });
    const saved = Array.isArray(rows) ? rows[0] : rows;
    return { id: saved?.id || null, identity, title: article.title };
  } catch (error) {
    if (/duplicate key|unique constraint|409/i.test(String(error?.message || error))) return { duplicate: true, identity };
    throw error;
  }
}

export async function run() {
  requiredEnvironment();
  const [feeds, x] = await Promise.all([collectOfficialFeeds(), collectOfficialX()]);
  const candidates = dedupeItems([...feeds.items, ...x.items])
    .filter((item) => isRecent(item, Date.now(), LOOKBACK_HOURS))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const results = [];
  let published = 0;
  let attempted = 0;
  for (const item of candidates) {
    if (published >= MAX_PUBLISH) break;
    const identity = itemIdentity(item);
    const existing = await findExisting(identity.externalId);
    if (existing) {
      results.push({ source: item.sourceKey, status: "duplicate", articleId: existing.id, title: existing.title });
      continue;
    }
    try {
      attempted += 1;
      if (attempted > MAX_PUBLISH * 3) break;
      const enrichedItem = await enrichOfficialItem(item);
      const article = await createChineseArticle(enrichedItem);
      const saved = await publishItem(enrichedItem, article);
      published += saved?.duplicate ? 0 : 1;
      results.push({ source: item.sourceKey, status: saved?.duplicate ? "duplicate" : (DRY_RUN ? "dry-run" : "published"), articleId: saved?.id || null, title: article.title });
    } catch (error) {
      results.push({ source: item.sourceKey, status: "failed", error: cleanText(error?.message || error, 500), originalTitle: item.title });
    }
  }
  const report = {
    pipeline: "niulai-finance-official-v1",
    dryRun: DRY_RUN,
    checkedAt: new Date().toISOString(),
    lookbackHours: LOOKBACK_HOURS,
    officialSources: feeds.sources,
    x: { configured: x.configured, handles: x.handles || [], count: x.items.length, error: x.error },
    candidates: candidates.length,
    published,
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!feeds.sources.some((source) => source.ok) && !x.items.length) throw new Error("所有财经官方来源均不可用");
  if (results.some((result) => result.status === "failed") && !results.some((result) => ["published", "dry-run", "duplicate"].includes(result.status))) {
    throw new Error("本轮候选财经信息全部处理失败");
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error("牛来财经采集失败：", error);
    process.exitCode = 1;
  });
}
